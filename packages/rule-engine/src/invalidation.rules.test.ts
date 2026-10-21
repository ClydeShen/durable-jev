import type { EntityVersions, RuleId } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import type { Expression } from './expression.types.js'
import { computeInputFingerprint, relevantEntityVersions } from './fingerprint.helpers.js'
import {
  invalidateDependentsOf,
  markInvalidated,
  recomputeInvalidated,
} from './invalidation.rules.js'
import type { RuleDefinition } from './rule-definition.schema.js'
import { evaluateRuleGraph, type LeafEvaluator } from './rule-graph.evaluator.js'

const ref = (ruleId: string): Expression => ({ kind: 'ref', ruleId: ruleId as RuleId })
const and = (...ruleIds: string[]): Expression => ({ kind: 'and', operands: ruleIds.map(ref) })

const rule = (ruleId: string, overrides: Partial<RuleDefinition> = {}): RuleDefinition => {
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

const rules = [
  rule('R05', { invalidationTriggers: ['vehicle'] }),
  rule('R16', { invalidationTriggers: ['vehicle'] }),
  rule('R31', { invalidationTriggers: ['customer'] }),
  rule('R32', { invalidationTriggers: ['quote'] }),
  rule('R25', { dependsOn: ['R05', 'R16'] as RuleId[] }),
  rule('R30', { combiner: ref('R25') }),
  rule('R36', { combiner: and('R31', 'R32') }),
  rule('R40', { combiner: and('R30', 'R36') }),
]
const subjects = { cargoItem: [], leg: [] }
const vehicleChange = { changeId: 'change-7', triggers: ['vehicle'] }

describe('invalidation after a vehicle change', () => {
  it('invalidates only the vehicle-dependent chain', () => {
    const invalidated = invalidateDependentsOf(rules, vehicleChange)
    expect([...invalidated].sort()).toEqual(['R05', 'R16', 'R25', 'R30', 'R40'])
  })

  it('records which change invalidated each result', () => {
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: rules,
      subjects,
      evaluateLeaf: () => ({ gateStatus: 'PASS' }),
    })
    const marked = markInvalidated(
      graph.evaluations,
      invalidateDependentsOf(rules, vehicleChange),
      vehicleChange,
    )
    expect(marked.find((evaluation) => evaluation.ruleId === 'R30')).toMatchObject({
      gateStatus: 'INVALIDATED',
      invalidatedByChange: 'change-7',
    })
    expect(marked.find((evaluation) => evaluation.ruleId === 'R31')?.gateStatus).toBe('PASS')
  })

  it('re-evaluates only invalidated leaf rules', () => {
    const previous = evaluateRuleGraph({
      rulesInEvaluationOrder: rules,
      subjects,
      evaluateLeaf: () => ({ gateStatus: 'PASS' }),
    })
    const reEvaluatedRuleIds: string[] = []
    const vehicleTooSmall: LeafEvaluator = (definition) => {
      reEvaluatedRuleIds.push(definition.ruleId)
      return { gateStatus: definition.ruleId === 'R05' ? 'FAIL' : 'PASS' }
    }

    const next = recomputeInvalidated({
      rulesInEvaluationOrder: rules,
      subjects,
      previous,
      invalidatedRuleIds: invalidateDependentsOf(rules, vehicleChange),
      evaluateLeaf: vehicleTooSmall,
    })

    expect(reEvaluatedRuleIds).toEqual(['R05', 'R16'])
    expect(next.statusOf('R36' as RuleId)).toBe('PASS')
    expect(next.statusOf('R40' as RuleId)).toBe('BLOCKED_DEPENDENCY')
  })
})

describe('computeInputFingerprint', () => {
  const entityVersions: EntityVersions = { cargo: 1, route: 1, carrier: 1, quote: 1 }
  const shipment = { legs: [{ vehicleId: 'V-1' }, { vehicleId: 'V-2' }], contactPhone: '123' }
  const fingerprintOf = (document: unknown, versions = entityVersions) =>
    computeInputFingerprint({
      document,
      inputPaths: ['legs.vehicleId'],
      entityVersions: versions,
      upstreamResultIds: [],
    })

  it('is stable for the same inputs', () => {
    expect(fingerprintOf(shipment)).toBe(fingerprintOf(structuredClone(shipment)))
  })

  it('ignores fields outside the input paths', () => {
    expect(fingerprintOf({ ...shipment, contactPhone: '999' })).toBe(fingerprintOf(shipment))
  })

  it('changes when a referenced value or entity version changes', () => {
    const swapped = { ...shipment, legs: [{ vehicleId: 'V-9' }, { vehicleId: 'V-2' }] }
    expect(fingerprintOf(swapped)).not.toBe(fingerprintOf(shipment))
    expect(fingerprintOf(shipment, { ...entityVersions, route: 2 })).not.toBe(
      fingerprintOf(shipment),
    )
  })
})

describe('relevantEntityVersions', () => {
  const versions: EntityVersions = { cargo: 2, route: 3, carrier: 1, quote: 5 }

  it('keeps only the versions a rule is triggered by', () => {
    expect(relevantEntityVersions(['cargo', 'carrier', 'vehicle'], versions)).toEqual({
      cargo: 2,
      route: 3,
      carrier: 1,
    })
    expect(relevantEntityVersions(['quote'], versions)).toEqual({ quote: 5 })
  })

  it('binds loading to every version', () => {
    expect(relevantEntityVersions(['loading'], versions)).toEqual(versions)
  })
})
