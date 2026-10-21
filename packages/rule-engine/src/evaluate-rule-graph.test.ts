import type { CheckStatus } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { type CaseFacts, evaluateRuleGraph, type LeafEvaluator } from './evaluate-rule-graph.js'
import { allOf, and, observed, ref } from './expression.js'
import type { RuleDefinition, RuleSet } from './rule-definition.js'
import { validateRuleSet } from './validate-rule-set.js'

const controlledBranch = observed('R04', { includes: 'controlled' })

function rule(ruleId: string, overrides: Partial<RuleDefinition>): RuleDefinition {
  return {
    ruleId,
    version: '1',
    title: ruleId,
    owner: 'cargo-assurance',
    scope: 'cargoItem',
    dependsOn: [],
    evaluator: { kind: 'code', ref: ruleId },
    unknownPolicy: 'block',
    inputPaths: [],
    parameters: [],
    invalidationTriggers: ['cargo'],
    ...overrides,
  }
}

const combinator = (ruleId: string, overrides: Partial<RuleDefinition>) =>
  rule(ruleId, { evaluator: { kind: 'combinator', ref: ruleId }, ...overrides })

const ruleSet: RuleSet = {
  ruleSetVersion: 'test',
  mixingMatrix: [
    { categories: ['general', 'general'], outcome: 'allowed' },
    { categories: ['general', 'coldChain'], outcome: 'allowed' },
    { categories: ['general', 'controlled'], outcome: 'forbidden' },
    { categories: ['coldChain', 'coldChain'], outcome: 'allowed' },
    { categories: ['coldChain', 'controlled'], outcome: 'forbidden' },
    { categories: ['controlled', 'controlled'], outcome: 'allowed' },
  ],
  rules: [
    rule('R01', { scope: 'order', owner: 'order-coordination' }),
    rule('R02', { dependsOn: ['R01'], parameters: ['maxItemWeightGrams'] }),
    rule('R04', { dependsOn: ['R02'], unknownPolicy: 'escalateToHuman' }),
    rule('R09', { dependsOn: ['R04'], appliesWhen: controlledBranch }),
    rule('R13', {
      dependsOn: ['R04', 'R09'],
      appliesWhen: controlledBranch,
      evaluator: { kind: 'humanGate', ref: 'R13' },
      humanGate: {
        taskType: 'APPROVAL',
        steps: [{ requiredRole: 'complianceReviewer' }],
        mode: 'sequential',
        distinctActors: true,
      },
    }),
    combinator('R14', {
      dependsOn: ['R04', 'R09', 'R13'],
      appliesWhen: controlledBranch,
      combiner: and(ref('R09'), ref('R13')),
    }),
    rule('R24', { scope: 'leg', owner: 'transport-planning', invalidationTriggers: ['route'] }),
    combinator('R30', {
      scope: 'order',
      owner: 'transport-planning',
      dependsOn: ['R24'],
      combiner: allOf('leg', ref('R24')),
    }),
    combinator('R37', {
      scope: 'order',
      owner: 'order-coordination',
      dependsOn: ['R02', 'R14'],
      combiner: allOf('cargoItem', and(ref('R02'), ref('R14'))),
    }),
    combinator('R40', {
      scope: 'order',
      owner: 'order-coordination',
      dependsOn: ['R30', 'R37'],
      combiner: and(ref('R30'), ref('R37')),
    }),
  ],
}

const pass = (): { status: CheckStatus } => ({ status: 'PASS' })

function evaluatorsWith(overrides: Record<string, LeafEvaluator> = {}): Map<string, LeafEvaluator> {
  const defaults: Record<string, LeafEvaluator> = {
    R01: pass,
    R02: ({ scopeFacts }) => ({
      status: Number(scopeFacts.weightGrams) <= 500_000 ? 'PASS' : 'FAIL',
      observedValue: scopeFacts.weightGrams,
    }),
    R04: ({ scopeFacts }) => ({ status: 'PASS', observedValue: scopeFacts.categories }),
    R09: pass,
    R13: pass,
    R24: pass,
  }
  return new Map(Object.entries({ ...defaults, ...overrides }))
}

function caseWith(
  items: { id: string; weightGrams: number; categories: string[] }[],
  legCount = 1,
): CaseFacts {
  return {
    entityVersions: {},
    order: {},
    cargoItems: items.map(({ id, ...facts }) => ({ cargoItemId: id, facts })),
    legs: Array.from({ length: legCount }, (_, index) => ({
      legId: `LEG-${index + 1}`,
      facts: {},
    })),
  }
}

const item = (id: string) => ({ kind: 'cargoItem', cargoItemId: id }) as const
const generalItems = caseWith([
  { id: 'ITEM-1', weightGrams: 200_000, categories: ['general'] },
  { id: 'ITEM-2', weightGrams: 300_000, categories: ['general'] },
])

describe('evaluateRuleGraph', () => {
  it('uses a rule set that passes validation', () => {
    const validation = validateRuleSet(ruleSet, {
      policyParameters: new Set(['maxItemWeightGrams']),
    })
    expect(validation.issues).toEqual([])
  })

  it('releases a general cargo order and marks the controlled branch not applicable', async () => {
    const graph = await evaluateRuleGraph(ruleSet, generalItems, evaluatorsWith())
    expect(graph.outcomeOf('R40')?.status).toBe('PASS')
    expect(graph.outcomeOf('R09', item('ITEM-1'))?.status).toBe('NOT_APPLICABLE')
    expect(graph.outcomeOf('R14', item('ITEM-2'))?.status).toBe('NOT_APPLICABLE')
  })

  it('fails the whole order when one cargo item fails (F17)', async () => {
    const facts = caseWith([
      { id: 'ITEM-1', weightGrams: 200_000, categories: ['general'] },
      { id: 'ITEM-2', weightGrams: 900_000, categories: ['general'] },
    ])
    const graph = await evaluateRuleGraph(ruleSet, facts, evaluatorsWith())
    expect(graph.outcomeOf('R02', item('ITEM-2'))?.status).toBe('FAIL')
    expect(graph.outcomeOf('R04', item('ITEM-2'))).toMatchObject({
      status: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R02'],
    })
    expect(graph.outcomeOf('R37')?.status).toBe('FAIL')
    expect(graph.outcomeOf('R40')?.status).toBe('FAIL')
  })

  it('carries a pending compliance approval up to the order with its blockers', async () => {
    const facts = caseWith([
      { id: 'ITEM-1', weightGrams: 200_000, categories: ['general'] },
      { id: 'ITEM-2', weightGrams: 100_000, categories: ['controlled'] },
    ])
    const graph = await evaluateRuleGraph(
      ruleSet,
      facts,
      evaluatorsWith({ R13: () => ({ status: 'WAITING_HUMAN' }) }),
    )
    expect(graph.outcomeOf('R14', item('ITEM-2'))).toMatchObject({
      status: 'WAITING_HUMAN',
      blockedBy: ['R13'],
    })
    expect(graph.outcomeOf('R14', item('ITEM-1'))?.status).toBe('NOT_APPLICABLE')
    expect(graph.outcomeOf('R40')).toMatchObject({ status: 'WAITING_HUMAN', blockedBy: ['R37'] })
  })

  it('blocks branch rules while the branch itself is unknown and escalates it', async () => {
    const graph = await evaluateRuleGraph(
      ruleSet,
      generalItems,
      evaluatorsWith({ R04: () => ({ status: 'UNKNOWN' }) }),
    )
    expect(graph.outcomeOf('R09', item('ITEM-1'))).toMatchObject({
      status: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R04'],
    })
    expect(graph.escalations).toContainEqual({ ruleId: 'R04', scope: item('ITEM-1') })
    expect(graph.outcomeOf('R40')?.status).not.toBe('PASS')
  })

  it('treats an order without legs as unknown, not as a valid plan', async () => {
    const facts = { ...generalItems, legs: [] }
    const graph = await evaluateRuleGraph(ruleSet, facts, evaluatorsWith())
    expect(graph.outcomeOf('R30')?.status).toBe('UNKNOWN')
    expect(graph.outcomeOf('R40')?.status).toBe('UNKNOWN')
  })

  it('turns a throwing evaluator into ERROR instead of PASS', async () => {
    const graph = await evaluateRuleGraph(
      ruleSet,
      generalItems,
      evaluatorsWith({
        R24: () => {
          throw new Error('carrier service down')
        },
      }),
    )
    expect(graph.outcomeOf('R24', { kind: 'leg', legId: 'LEG-1' })).toMatchObject({
      status: 'ERROR',
      error: 'Error: carrier service down',
    })
    expect(graph.outcomeOf('R40')?.status).toBe('ERROR')
  })
})
