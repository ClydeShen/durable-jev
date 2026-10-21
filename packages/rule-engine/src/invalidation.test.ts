import { describe, expect, it } from 'vitest'
import { type CaseFacts, evaluateRuleGraph, type LeafEvaluator } from './evaluate-rule-graph.js'
import { allOf, and, ref } from './expression.js'
import { invalidateDependentsOf, markInvalidated } from './invalidation.js'
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

const original: CaseFacts = {
  entityVersions: { cargo: 1, route: 1, carrier: 1, quote: 1 },
  order: { customerActive: true },
  cargoItems: [{ cargoItemId: 'ITEM-1', facts: { weightGrams: 400_000 } }],
  legs: [
    { legId: 'LEG-1', facts: { vehicleId: 'VEH-7', vehicleMaxPayloadGrams: 12_000_000 } },
    { legId: 'LEG-2', facts: { vehicleId: 'VEH-9', vehicleMaxPayloadGrams: 12_000_000 } },
  ],
}

const vehicleChanged: CaseFacts = {
  ...original,
  entityVersions: { ...original.entityVersions, route: 2 },
  legs: [
    { legId: 'LEG-1', facts: { vehicleId: 'VEH-12', vehicleMaxPayloadGrams: 8_000_000 } },
    original.legs[1] as CaseFacts['legs'][number],
  ],
}

describe('invalidateDependentsOf', () => {
  it('invalidates exactly the rules downstream of a vehicle change', () => {
    const affected = invalidateDependentsOf(ruleSet, { changeId: 'chg-1', entities: ['route'] })
    expect([...affected].sort()).toEqual(['R05', 'R13', 'R16', 'R30', 'R40'])
  })

  it('marks affected results with the change that caused it', async () => {
    const { environment } = countingEvaluators()
    const first = await evaluateRuleGraph(ruleSet, original, environment)
    const marked = markInvalidated(first.outcomes, ruleSet, {
      changeId: 'chg-1',
      entities: ['route'],
    })
    const byRule = (ruleId: string) => marked.filter((result) => result.ruleId === ruleId)
    expect(byRule('R05').every((result) => result.status === 'INVALIDATED')).toBe(true)
    expect(byRule('R05')[0]?.invalidatedBy).toBe('chg-1')
    expect(byRule('R31')[0]?.status).toBe('PASS')
    expect(byRule('R02')[0]?.status).toBe('PASS')
  })
})

describe('incremental evaluation', () => {
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
    const marked = markInvalidated(first.outcomes, ruleSet, {
      changeId: 'chg-1',
      entities: ['route'],
    })
    calls.length = 0
    const second = await evaluateRuleGraph(ruleSet, vehicleChanged, environment, {
      previous: marked,
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
