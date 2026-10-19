import type { CheckSubject, GateStatus, RuleId } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { evaluateRuleGraph, type LeafOutcome } from './evaluate-rule-graph.js'
import type { Expression } from './expression.js'
import type { RuleDefinition } from './rule-definition.js'

const ref = (ruleId: string): Expression => ({ kind: 'ref', ruleId: ruleId as RuleId })

function rule(ruleId: string, overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    ruleId: ruleId as RuleId,
    version: '1',
    scope: 'order',
    dependsOn: [],
    evaluator: { kind: overrides.combiner ? 'combinator' : 'code', ref: ruleId },
    unknownPolicy: 'block',
    inputPaths: [],
    parameters: [],
    invalidationTriggers: [],
    ...overrides,
  }
}

function leafStatuses(statuses: Record<string, GateStatus>) {
  return (definition: RuleDefinition, subject: CheckSubject): LeafOutcome => ({
    gateStatus:
      statuses[`${definition.ruleId}@${subject.entityId}`] ?? statuses[definition.ruleId] ?? 'PASS',
  })
}

const cargoRules = [
  rule('R01'),
  rule('R02', { scope: 'cargoItem', dependsOn: ['R01' as RuleId] }),
  rule('R37', { combiner: { kind: 'allOf', scope: 'cargoItem', expression: ref('R02') } }),
  rule('R40', { combiner: { kind: 'and', operands: [ref('R01'), ref('R37')] } }),
]

describe('evaluateRuleGraph', () => {
  it('fails the whole order when one of several cargo items fails (F17)', () => {
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: cargoRules,
      subjects: { cargoItem: ['item-1', 'item-2', 'item-3'], leg: [] },
      evaluateLeaf: leafStatuses({ 'R02@item-2': 'FAIL' }),
    })
    expect(graph.statusOf('R37' as RuleId)).toBe('FAIL')
    expect(graph.statusOf('R40' as RuleId)).toBe('FAIL')
  })

  it('treats an order without cargo items as UNKNOWN, not PASS, and blocks the order on it', () => {
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: cargoRules,
      subjects: { cargoItem: [], leg: [] },
      evaluateLeaf: leafStatuses({}),
    })
    expect(graph.evaluations.find((evaluation) => evaluation.ruleId === 'R37')).toMatchObject({
      gateStatus: 'UNKNOWN',
      blockedBy: [],
    })
    expect(graph.evaluations.at(-1)).toMatchObject({
      gateStatus: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R37'],
    })
  })

  it('blocks rules whose dependency has not passed and names the blocker', () => {
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: cargoRules,
      subjects: { cargoItem: ['item-1'], leg: [] },
      evaluateLeaf: leafStatuses({ R01: 'UNKNOWN' }),
    })
    const blocked = graph.evaluations.find((evaluation) => evaluation.ruleId === 'R02')
    expect(blocked).toMatchObject({ gateStatus: 'BLOCKED_DEPENDENCY', blockedBy: ['R01'] })
    expect(graph.statusOf('R40' as RuleId)).toBe('BLOCKED_DEPENDENCY')
  })

  it('marks a rule NOT_APPLICABLE per item when its applicability fails', () => {
    const rules = [
      rule('R04', { scope: 'cargoItem' }),
      rule('R15', { scope: 'cargoItem', appliesWhen: ref('R04') }),
    ]
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: rules,
      subjects: { cargoItem: ['cold', 'general'], leg: [] },
      evaluateLeaf: leafStatuses({ 'R04@general': 'FAIL' }),
    })
    const coldChainStatuses = graph.evaluations
      .filter((evaluation) => evaluation.ruleId === 'R15')
      .map((evaluation) => [evaluation.subject.entityId, evaluation.gateStatus])
    expect(coldChainStatuses).toEqual([
      ['cold', 'PASS'],
      ['general', 'NOT_APPLICABLE'],
    ])
  })

  it('blocks a rule while its applicability is still undecided', () => {
    const rules = [rule('R04'), rule('R09', { appliesWhen: ref('R04') })]
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: rules,
      subjects: { cargoItem: [], leg: [] },
      evaluateLeaf: leafStatuses({ R04: 'UNKNOWN' }),
    })
    expect(graph.evaluations[1]).toMatchObject({
      gateStatus: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R04'],
    })
  })

  it('escalates UNKNOWN leaf results to a human when the policy says so', () => {
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: [rule('R03', { unknownPolicy: 'escalateToHuman' })],
      subjects: { cargoItem: [], leg: [] },
      evaluateLeaf: leafStatuses({ R03: 'UNKNOWN' }),
    })
    expect(graph.statusOf('R03' as RuleId)).toBe('WAITING_HUMAN')
  })

  it('lets an OR combinator pass even though one branch failed', () => {
    const rules = [
      rule('R32'),
      rule('R33'),
      rule('R34'),
      rule('R36', {
        combiner: {
          kind: 'or',
          operands: [ref('R32'), { kind: 'and', operands: [ref('R33'), ref('R34')] }],
        },
      }),
    ]
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: rules,
      subjects: { cargoItem: [], leg: [] },
      evaluateLeaf: leafStatuses({ R32: 'FAIL', R34: 'WAITING_HUMAN' }),
    })
    expect(graph.evaluations.at(-1)).toMatchObject({
      gateStatus: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R34'],
    })
  })

  it('keeps WAITING_HUMAN on the human gate and blocks every rule nested above it', () => {
    const rules = [
      rule('R30'),
      rule('R39-LOAD', { dependsOn: ['R30' as RuleId] }),
      rule('R39-CONFIRM', { dependsOn: ['R39-LOAD' as RuleId] }),
      rule('R39', { combiner: { kind: 'and', operands: [ref('R39-LOAD'), ref('R39-CONFIRM')] } }),
      rule('R40', { combiner: { kind: 'and', operands: [ref('R30'), ref('R39')] } }),
    ]
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: rules,
      subjects: { cargoItem: [], leg: [] },
      evaluateLeaf: leafStatuses({ 'R39-LOAD': 'WAITING_HUMAN' }),
    })
    const statuses = Object.fromEntries(
      graph.evaluations.map((evaluation) => [evaluation.ruleId, evaluation.gateStatus]),
    )
    expect(statuses).toEqual({
      R30: 'PASS',
      'R39-LOAD': 'WAITING_HUMAN',
      'R39-CONFIRM': 'BLOCKED_DEPENDENCY',
      R39: 'BLOCKED_DEPENDENCY',
      R40: 'BLOCKED_DEPENDENCY',
    })
  })
})
