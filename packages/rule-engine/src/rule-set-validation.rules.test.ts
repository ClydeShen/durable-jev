import { describe, expect, it } from 'vitest'
import type { RuleDefinition } from './rule-definition.js'
import { validateRuleSet } from './validate-rule-set.js'

function rule(ruleId: string, overrides: Partial<Record<keyof RuleDefinition, unknown>> = {}) {
  return {
    ruleId,
    version: '1',
    scope: 'order',
    dependsOn: [],
    evaluator: { kind: 'code', ref: ruleId },
    unknownPolicy: 'block',
    inputPaths: [],
    parameters: [],
    invalidationTriggers: [],
    ...overrides,
  }
}

const parameters = { maxVehicleWeightGrams: 24_000_000 }

describe('validateRuleSet (F16)', () => {
  it('accepts a valid graph and returns a dependency-first order', () => {
    const result = validateRuleSet(
      [rule('R02', { dependsOn: ['R01'], parameters: ['maxVehicleWeightGrams'] }), rule('R01')],
      parameters,
    )
    expect(result).toMatchObject({ valid: true, evaluationOrder: ['R01', 'R02'] })
  })

  it('rejects a missing dependency', () => {
    const result = validateRuleSet([rule('R02', { dependsOn: ['R01'] })], parameters)
    expect(result).toEqual({
      valid: false,
      issues: [{ kind: 'missingReference', ruleId: 'R02', missingRuleId: 'R01' }],
    })
  })

  it('rejects a cycle introduced through a combiner', () => {
    const result = validateRuleSet(
      [
        rule('R14', {
          evaluator: { kind: 'combinator', ref: 'and' },
          combiner: { kind: 'ref', ruleId: 'R13' },
        }),
        rule('R13', { dependsOn: ['R14'] }),
      ],
      parameters,
    )
    expect(result).toEqual({ valid: false, issues: [{ kind: 'cycle', ruleIds: ['R14', 'R13'] }] })
  })

  it('rejects a missing policy parameter', () => {
    const result = validateRuleSet(
      [rule('R05', { parameters: ['maxSensorAgeMinutes'] })],
      parameters,
    )
    expect(result).toEqual({
      valid: false,
      issues: [{ kind: 'missingParameter', ruleId: 'R05', parameter: 'maxSensorAgeMinutes' }],
    })
  })

  it('rejects an order rule that reads a cargo item rule without aggregation', () => {
    const result = validateRuleSet(
      [
        rule('R02', { scope: 'cargoItem' }),
        rule('R37', {
          evaluator: { kind: 'combinator', ref: 'and' },
          combiner: { kind: 'ref', ruleId: 'R02' },
        }),
      ],
      parameters,
    )
    expect(result.valid).toBe(false)
    expect(!result.valid && result.issues[0]?.kind).toBe('typeMismatch')
  })

  it('accepts the same reference wrapped in allOf', () => {
    const result = validateRuleSet(
      [
        rule('R02', { scope: 'cargoItem' }),
        rule('R37', {
          evaluator: { kind: 'combinator', ref: 'and' },
          combiner: {
            kind: 'allOf',
            scope: 'cargoItem',
            expression: { kind: 'ref', ruleId: 'R02' },
          },
        }),
      ],
      parameters,
    )
    expect(result.valid).toBe(true)
  })

  it('rejects escalation to a human without a reviewer role', () => {
    const result = validateRuleSet([rule('R03', { unknownPolicy: 'escalateToHuman' })], parameters)
    expect(!result.valid && result.issues[0]).toMatchObject({ kind: 'typeMismatch', ruleId: 'R03' })

    const withReviewer = validateRuleSet(
      [
        rule('R03', {
          unknownPolicy: 'escalateToHuman',
          humanGate: { taskType: 'APPROVAL', requiredRole: 'TRANSPORT_PLANNER' },
        }),
      ],
      parameters,
    )
    expect(withReviewer.valid).toBe(true)
  })

  it('rejects an operation gate that does not say which evidence it needs', () => {
    const result = validateRuleSet(
      [
        rule('R21', {
          evaluator: { kind: 'humanGate', ref: 'repack' },
          humanGate: { taskType: 'OPERATION', requiredRole: 'WAREHOUSE_OPERATOR' },
        }),
      ],
      parameters,
    )
    expect(!result.valid && result.issues[0]).toMatchObject({ kind: 'typeMismatch', ruleId: 'R21' })
  })

  it('rejects a combinator without a combiner and malformed definitions', () => {
    const missingCombiner = validateRuleSet(
      [rule('R40', { evaluator: { kind: 'combinator', ref: 'and' } })],
      parameters,
    )
    expect(!missingCombiner.valid && missingCombiner.issues[0]?.kind).toBe('typeMismatch')

    const malformed = validateRuleSet([rule('R01', { scope: 'warehouse' })], parameters)
    expect(!malformed.valid && malformed.issues[0]?.kind).toBe('invalidSchema')
  })
})
