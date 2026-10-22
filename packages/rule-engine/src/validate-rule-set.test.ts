import { describe, expect, it } from 'vitest'
import { allOf, and, ref } from './expression.js'
import type { MixingRule, RuleDefinition, RuleSet } from './rule-definition.js'
import { type ValidationEnvironment, validateRuleSet } from './validate-rule-set.js'

function rule(ruleId: string, overrides: Partial<RuleDefinition> = {}): RuleDefinition {
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

const completeMixingMatrix: MixingRule[] = [
  { categories: ['general', 'general'], outcome: 'allowed' },
  { categories: ['general', 'coldChain'], outcome: 'allowed' },
  { categories: ['controlled', 'general'], outcome: 'forbidden' },
  { categories: ['coldChain', 'coldChain'], outcome: 'allowed' },
  {
    categories: ['controlled', 'coldChain'],
    outcome: 'requiresQualification',
    qualification: 'CTRL-COLD',
  },
  { categories: ['controlled', 'controlled'], outcome: 'allowed' },
]

const baseRules: RuleDefinition[] = [
  rule('R01', { scope: 'order', owner: 'order-coordination' }),
  rule('R02', {
    dependsOn: ['R01'],
    parameters: ['maxItemWeightGrams'],
    evaluator: { kind: 'expression', ref: 'R02' },
    expression: { passWhen: 'item.weightGrams <= params.maxItemWeightGrams' },
  }),
  rule('R03', {
    dependsOn: ['R01'],
    evaluator: { kind: 'semantic', ref: 'R03' },
    semantic: {
      promptVersion: 'v1',
      question: { kind: 'noul', text: 'The description matches the declared category' },
      state: { description: 'item.description' },
      passWhen: { probabilityAtLeast: 0.8 },
    },
  }),
  rule('R13', {
    dependsOn: ['R03'],
    evaluator: { kind: 'humanGate', ref: 'R13' },
    humanGate: {
      taskType: 'APPROVAL',
      steps: [{ requiredRole: 'complianceReviewer' }, { requiredRole: 'qualityReviewer' }],
      mode: 'sequential',
      distinctActors: true,
      evidenceRequirements: [],
      expiresAfterHours: 12,
    },
  }),
  rule('R37', {
    scope: 'order',
    owner: 'order-coordination',
    dependsOn: ['R02', 'R13'],
    evaluator: { kind: 'combinator', ref: 'R37' },
    combiner: allOf('cargoItem', and(ref('R02'), ref('R13'))),
  }),
  rule('CUST-C07-001', {
    scope: 'order',
    owner: 'commercial-control',
    evaluator: { kind: 'expression', ref: 'CUST-C07-001' },
    expression: { passWhen: 'order.handover = "dock"' },
    applicability: { customers: ['CUS-7'] },
  }),
]

const ruleSet: RuleSet = {
  ruleSetVersion: 'v1',
  rules: baseRules,
  mixingMatrix: completeMixingMatrix,
}

const environment: ValidationEnvironment = {
  policyParameters: new Set(['maxItemWeightGrams']),
  evaluatorRefs: new Set(['R01']),
}

function withRules(...rules: RuleDefinition[]): RuleSet {
  const replaced = new Map(rules.map((replacement) => [replacement.ruleId, replacement]))
  const kept = baseRules.map((existing) => replaced.get(existing.ruleId) ?? existing)
  const added = rules.filter(
    (candidate) => !baseRules.some((existing) => existing.ruleId === candidate.ruleId),
  )
  return { ...ruleSet, rules: [...kept, ...added] }
}

const codesOf = (document: unknown) =>
  validateRuleSet(document, environment).issues.map((issue) => issue.code)

describe('validateRuleSet', () => {
  it('accepts a consistent rule set', () => {
    const validation = validateRuleSet(ruleSet, environment)
    expect(validation.issues).toEqual([])
    expect(validation.valid).toBe(true)
  })

  it('rejects dependency cycles (F16)', () => {
    const validation = validateRuleSet(
      withRules(rule('R01', { scope: 'order', dependsOn: ['R37'] })),
      environment,
    )
    expect(validation.valid).toBe(false)
    expect(
      validation.issues.filter((issue) => issue.code === 'CYCLE').map((issue) => issue.ruleId),
    ).toEqual(expect.arrayContaining(['R01', 'R37']))
  })

  it('rejects missing and undeclared dependencies (F16)', () => {
    expect(
      codesOf(withRules(rule('R02', { dependsOn: ['R99'], parameters: ['maxItemWeightGrams'] }))),
    ).toContain('MISSING_REFERENCE')
    const undeclared = rule('R37', {
      scope: 'order',
      dependsOn: ['R02'],
      evaluator: { kind: 'combinator', ref: 'R37' },
      combiner: allOf('cargoItem', and(ref('R02'), ref('R13'))),
    })
    expect(codesOf(withRules(undeclared))).toEqual(['UNDECLARED_DEPENDENCY'])
  })

  it('rejects reading item-scoped results from the order without a collection', () => {
    const direct = rule('R37', {
      scope: 'order',
      dependsOn: ['R02'],
      evaluator: { kind: 'combinator', ref: 'R37' },
      combiner: ref('R02'),
    })
    expect(codesOf(withRules(direct))).toEqual(['SCOPE_MISMATCH'])
  })

  it('requires every policy parameter to exist', () => {
    expect(
      codesOf(withRules(rule('R01', { scope: 'order', parameters: ['maxItemWeightKg'] }))),
    ).toEqual(['MISSING_PARAMETER'])
  })

  it('requires evaluators to match their kind and be registered', () => {
    expect(
      codesOf(
        withRules(
          rule('R13', { dependsOn: ['R03'], evaluator: { kind: 'humanGate', ref: 'R13' } }),
        ),
      ),
    ).toEqual(['EVALUATOR_SHAPE'])
    expect(
      codesOf(
        withRules(rule('R01', { scope: 'order', evaluator: { kind: 'code', ref: 'R01-v2' } })),
      ),
    ).toEqual(['UNKNOWN_EVALUATOR'])
  })

  it('checks FEEL syntax and the parameters an expression reads', () => {
    const broken = rule('R02', {
      dependsOn: ['R01'],
      parameters: ['maxItemWeightGrams'],
      evaluator: { kind: 'expression', ref: 'R02' },
      expression: { passWhen: 'item.weightGrams <= ' },
    })
    expect(codesOf(withRules(broken))).toEqual(['EXPRESSION_SYNTAX'])
    const undeclared = rule('R02', {
      dependsOn: ['R01'],
      evaluator: { kind: 'expression', ref: 'R02' },
      expression: { passWhen: 'item.weightGrams <= params.maxItemWeightGrams' },
    })
    expect(codesOf(withRules(undeclared))).toEqual(['UNDECLARED_PARAMETER'])
  })

  it('requires semantic pass labels to be options of the question', () => {
    const mislabelled = rule('R03', {
      dependsOn: ['R01'],
      evaluator: { kind: 'semantic', ref: 'R03' },
      semantic: {
        promptVersion: 'v1',
        question: {
          kind: 'choice',
          text: 'Risk signal?',
          options: { no_risk: 'None', damaged: 'Damage' },
        },
        state: { note: 'item.inspectionNote' },
        passWhen: { choiceIn: ['none'] },
      },
    })
    expect(codesOf(withRules(mislabelled))).toEqual(['EVALUATOR_SHAPE'])
  })

  it('requires extension rules to declare applicability', () => {
    const unselectable = rule('CUST-C07-001', {
      scope: 'order',
      evaluator: { kind: 'expression', ref: 'CUST-C07-001' },
      expression: { passWhen: 'order.handover = "dock"' },
    })
    expect(codesOf(withRules(unselectable))).toEqual(['MISSING_APPLICABILITY'])
  })

  it('limits approval chains to three roles', () => {
    const fourSteps = rule('R13', {
      dependsOn: ['R03'],
      evaluator: { kind: 'humanGate', ref: 'R13' },
      humanGate: {
        taskType: 'APPROVAL',
        steps: [
          { requiredRole: 'complianceReviewer' },
          { requiredRole: 'qualityReviewer' },
          { requiredRole: 'commercialManager' },
          { requiredRole: 'dispatcher' },
        ],
        mode: 'sequential',
        distinctActors: true,
        evidenceRequirements: [],
        expiresAfterHours: 12,
      },
    })
    expect(codesOf(withRules(fourSteps))).toEqual(['SCHEMA'])
  })

  it('rejects a contradictory or incomplete mixing matrix', () => {
    const contradictory = [
      ...completeMixingMatrix,
      { categories: ['general', 'controlled'], outcome: 'allowed' } as MixingRule,
    ]
    expect(codesOf({ ...ruleSet, mixingMatrix: contradictory })).toEqual(['MIXING_CONFLICT'])
    expect(codesOf({ ...ruleSet, mixingMatrix: completeMixingMatrix.slice(1) })).toEqual([
      'MIXING_INCOMPLETE',
    ])
    const unqualified = completeMixingMatrix.map((entry) =>
      entry.outcome === 'requiresQualification'
        ? { categories: entry.categories, outcome: entry.outcome }
        : entry,
    )
    expect(codesOf({ ...ruleSet, mixingMatrix: unqualified })).toEqual(['MIXING_QUALIFICATION'])
  })
})
