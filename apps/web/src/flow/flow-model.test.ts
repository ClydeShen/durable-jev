import type { CheckResult, GateStatus } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import {
  aggregateStatus,
  buildFlowModel,
  edgeStateFor,
  withoutRedundantEdges,
} from './flow-model.js'

const rule = (ruleId: string, dependsOn: string[] = []) =>
  ({ ruleId, dependsOn, evaluator: { kind: 'code', ref: ruleId } }) as unknown as RuleDefinition

const check = (
  ruleId: string,
  gateStatus: GateStatus,
  entityId = 'order',
  blockedBy: string[] = [],
) =>
  ({
    checkResultId: `${ruleId}-${entityId}`,
    ruleId,
    subject: { scope: entityId === 'order' ? 'order' : 'cargoItem', entityId },
    gateStatus,
    blockedBy,
  }) as unknown as CheckResult

describe('aggregateStatus', () => {
  it('reports the most severe status across items', () => {
    expect(aggregateStatus(['PASS', 'FAIL', 'WAITING_HUMAN'])).toBe('FAIL')
    expect(aggregateStatus(['PASS', 'NOT_APPLICABLE'])).toBe('PASS')
    expect(aggregateStatus(['NOT_APPLICABLE', 'NOT_APPLICABLE'])).toBe('NOT_APPLICABLE')
  })
})

describe('edgeStateFor', () => {
  it('flows only from a passed rule and stops everywhere else', () => {
    expect(edgeStateFor('PASS')).toBe('flowing')
    expect(edgeStateFor('WAITING_HUMAN')).toBe('waiting')
    expect(edgeStateFor('BLOCKED_DEPENDENCY')).toBe('blocked')
    expect(edgeStateFor('FAIL')).toBe('failed')
    expect(edgeStateFor('NOT_APPLICABLE')).toBe('inactive')
  })
})

describe('withoutRedundantEdges', () => {
  it('drops a shortcut that a longer path already covers', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'A', to: 'C' },
    ]
    expect(withoutRedundantEdges(edges)).toEqual([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ])
  })
})

describe('buildFlowModel', () => {
  const rules = [
    rule('R01'),
    rule('R09', ['R01']),
    rule('R39', ['R01']),
    rule('R40', ['R09', 'R39']),
  ]
  const checks = [
    check('R01', 'PASS'),
    check('R09', 'NOT_APPLICABLE'),
    check('R39', 'WAITING_HUMAN'),
    check('R40', 'BLOCKED_DEPENDENCY', 'order', ['R39']),
  ]

  it('hides not-applicable rules and marks where the flow stops', () => {
    const model = buildFlowModel({
      rootRuleId: 'R40',
      rules,
      checks,
      humanTasks: [],
      showNotApplicable: false,
    })
    expect(model.nodes.map((node) => node.ruleId).sort()).toEqual(['R01', 'R39', 'R40'])
    expect(model.edges).toEqual(
      expect.arrayContaining([
        { from: 'R01', to: 'R39', state: 'flowing' },
        { from: 'R39', to: 'R40', state: 'waiting' },
      ]),
    )
    expect(model.nodes.find((node) => node.ruleId === 'R40')?.waitingOn).toEqual(['R39'])
  })

  it('can show not-applicable rules as inactive', () => {
    const model = buildFlowModel({
      rootRuleId: 'R40',
      rules,
      checks,
      humanTasks: [],
      showNotApplicable: true,
    })
    expect(model.edges).toContainEqual({ from: 'R09', to: 'R40', state: 'inactive' })
  })
})
