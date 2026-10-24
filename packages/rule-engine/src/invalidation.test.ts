import { describe, expect, it } from 'vitest'
import { evaluateRuleGraph, type LeafEvaluator } from './evaluate-rule-graph.js'
import { allOf, and, ref } from './expression.js'
import type { CaseFacts } from './facts.js'
import { invalidateDependentsOf } from './invalidation.js'
import type { RuleDefinition, RuleSet } from './rule-definition.js'

function rule(ruleId: string, overrides: Partial<RuleDefinition>): RuleDefinition {
  return {
    ruleId,
    version: '1',
    title: ruleId,
    owner: 'transport-planning',
    scope: 'leg',
    dependsOn: [],
    evaluator: { kind: 'code', ref: ruleId },
    unknownPolicy: 'block',
    inputPaths: [],
    parameters: [],
    invalidationTriggers: [],
    ...overrides,
  }
}

const ruleSet: RuleSet = {
  ruleSetVersion: 'test',
  rootScope: 'order',
  mixingMatrix: [],
  rules: [
    rule('R02', {
      scope: 'cargoItem',
      owner: 'cargo-assurance',
      inputPaths: ['weightGrams'],
      invalidationTriggers: ['cargo'],
    }),
    rule('R05', {
      inputPaths: ['vehicleId', 'vehicleMaxPayloadGrams'],
      invalidationTriggers: ['route'],
    }),
    rule('R16', {
      evaluator: { kind: 'semantic', ref: 'R16' },
      inputPaths: ['vehicleId'],
      invalidationTriggers: ['route'],
    }),
    rule('R31', {
      scope: 'order',
      owner: 'commercial-control',
      inputPaths: ['order.customerActive'],
      invalidationTriggers: ['quote'],
    }),
    rule('R13', {
      scope: 'order',
      owner: 'cargo-assurance',
      dependsOn: ['R05'],
      evaluator: { kind: 'humanGate', ref: 'R13' },
      humanGate: {
        taskType: 'APPROVAL',
        steps: [{ requiredRole: 'complianceReviewer' }],
        mode: 'sequential',
        distinctActors: true,
        evidenceRequirements: [],
        expiresAfterHours: 12,
      },
      invalidationTriggers: ['carrier'],
    }),
    rule('R30', {
      scope: 'order',
      dependsOn: ['R05', 'R16'],
      evaluator: { kind: 'combinator', ref: 'R30' },
      combiner: allOf('leg', and(ref('R05'), ref('R16'))),
    }),
    rule('R40', {
      scope: 'order',
      owner: 'order-coordination',
      dependsOn: ['R02', 'R13', 'R30', 'R31'],
      evaluator: { kind: 'combinator', ref: 'R40' },
      combiner: and(allOf('cargoItem', ref('R02')), ref('R13'), ref('R30'), ref('R31')),
    }),
  ],
}

function countingEvaluators() {
  const calls: string[] = []
  const passing: LeafEvaluator = ({ rule: { ruleId } }) => {
    calls.push(ruleId)
    return { status: 'PASS' }
  }
  const evaluators = new Map(['R02', 'R05', 'R16', 'R31', 'R13'].map((id) => [id, passing]))
  return { calls, environment: { evaluators, parameters: {} } }
}

function vehicleFacts(vehicleId: string, vehicleMaxPayloadGrams: number): CaseFacts {
  const order = { customerActive: true }
  const item = { weightGrams: 400_000 }
  const legs = [
    { vehicleId, vehicleMaxPayloadGrams },
    { vehicleId: 'VEH-9', vehicleMaxPayloadGrams: 12_000_000 },
  ]
  return {
    entityVersions: { cargo: 1, route: 1, carrier: 1, quote: 1 },
    root: { scope: { kind: 'order' }, facts: order },
    context: { order, cargoItems: [item], legs },
    collections: {
      cargoItem: [
        { scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' }, facts: item, context: { item } },
      ],
      leg: legs.map((facts, index) => ({
        scope: { kind: 'leg', legId: `LEG-${index + 1}` },
        facts,
        context: { leg: facts },
      })),
    },
  }
}

const original = vehicleFacts('VEH-7', 12_000_000)

const vehicleChanged: CaseFacts = {
  ...vehicleFacts('VEH-12', 8_000_000),
  entityVersions: { ...original.entityVersions, route: 2 },
}

describe('invalidateDependentsOf', () => {
  it('invalidates exactly the rules downstream of a vehicle change', () => {
    const affected = invalidateDependentsOf(ruleSet, { changeId: 'chg-1', entities: ['route'] })
    expect([...affected].sort()).toEqual(['R05', 'R13', 'R16', 'R30', 'R40'])
  })
})

describe('incremental evaluation', () => {
  it('invalidates a code result when a domain-named context input changes', async () => {
    const definition = rule('R01', { scope: 'order', inputPaths: ['record.amount'] })
    const rules: RuleSet = {
      ruleSetVersion: 'context',
      rootScope: 'order',
      rules: [definition],
      mixingMatrix: [],
    }
    const facts = (amount: number): CaseFacts => ({
      entityVersions: {},
      root: { scope: { kind: 'order' }, facts: { amount } },
      context: { record: { amount } },
      collections: {},
    })
    const environment = {
      parameters: {},
      evaluators: new Map<string, LeafEvaluator>([
        ['R01', ({ scopeFacts }) => ({ status: 'PASS', observedValue: scopeFacts.amount })],
      ]),
    }
    const before = await evaluateRuleGraph(rules, facts(100), environment)
    const after = await evaluateRuleGraph(rules, facts(200), environment, {
      previous: before.outcomes,
    })
    expect(after.outcomeOf('R01')?.observedValue).toBe(200)
    expect(after.outcomeOf('R01')?.inputFingerprint).not.toBe(
      before.outcomeOf('R01')?.inputFingerprint,
    )
    expect(after.outcomeOf('R01')?.reused).not.toBe(true)
  })

  it('reuses unchanged code and Jev results but always rechecks human gates', async () => {
    const { calls, environment } = countingEvaluators()
    const first = await evaluateRuleGraph(ruleSet, original, environment)
    calls.length = 0
    const second = await evaluateRuleGraph(ruleSet, original, environment, {
      previous: first.outcomes,
    })
    expect(calls).toEqual(['R13'])
    expect(second.outcomeOf('R40')?.status).toBe('PASS')
  })

  it('re-evaluates only what the vehicle change touches', async () => {
    const { calls, environment } = countingEvaluators()
    const first = await evaluateRuleGraph(ruleSet, original, environment)
    calls.length = 0
    const second = await evaluateRuleGraph(ruleSet, vehicleChanged, environment, {
      previous: first.outcomes,
    })
    expect(calls.sort()).toEqual(['R05', 'R05', 'R13', 'R16', 'R16'])
    expect(second.outcomeOf('R31')?.reused).toBe(true)
    expect(second.outcomeOf('R02', { kind: 'cargoItem', cargoItemId: 'ITEM-1' })?.reused).toBe(true)
  })

  it('gives the compliance approval a new fingerprint when its inputs change', async () => {
    const { environment } = countingEvaluators()
    const first = await evaluateRuleGraph(ruleSet, original, environment)
    const second = await evaluateRuleGraph(ruleSet, vehicleChanged, environment, {
      previous: first.outcomes,
    })
    expect(second.outcomeOf('R13')?.inputFingerprint).not.toBe(
      first.outcomeOf('R13')?.inputFingerprint,
    )
    expect(second.outcomeOf('R31')?.inputFingerprint).toBe(first.outcomeOf('R31')?.inputFingerprint)
  })
})
