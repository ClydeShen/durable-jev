import { type CargoCategory, cargoCategorySchema, type RuleId } from '@durable-jev/contracts'
import type { CollectionScope, Expression } from './expression.js'
import {
  type MixingRule,
  type RuleDefinition,
  type RuleScope,
  type RuleSet,
  ruleSetSchema,
} from './rule-definition.js'

export type ValidationIssueCode =
  | 'SCHEMA'
  | 'DUPLICATE_RULE'
  | 'MISSING_REFERENCE'
  | 'UNDECLARED_DEPENDENCY'
  | 'SCOPE_MISMATCH'
  | 'EVALUATOR_SHAPE'
  | 'UNKNOWN_EVALUATOR'
  | 'MISSING_PARAMETER'
  | 'CYCLE'
  | 'MISSING_APPLICABILITY'
  | 'MIXING_CONFLICT'
  | 'MIXING_INCOMPLETE'
  | 'MIXING_QUALIFICATION'

export interface ValidationIssue {
  code: ValidationIssueCode
  ruleId?: RuleId
  message: string
}

export interface RuleSetValidation {
  valid: boolean
  issues: ValidationIssue[]
  ruleSet?: RuleSet
}

export interface ValidationEnvironment {
  policyParameters: ReadonlySet<string>
  evaluatorRefs?: ReadonlySet<string>
}

export function referencedRules(expression: Expression): RuleId[] {
  switch (expression.op) {
    case 'ref':
      return [expression.ruleId]
    case 'and':
    case 'or':
      return expression.of.flatMap(referencedRules)
    case 'not':
    case 'allOf':
    case 'anyOf':
      return referencedRules(expression.of)
    case 'ifThen':
      return [...referencedRules(expression.condition), ...referencedRules(expression.consequence)]
  }
}

function expressionsOf(rule: RuleDefinition): Expression[] {
  return [
    rule.appliesWhen,
    rule.combiner,
    ...(rule.humanGate?.steps.map((step) => step.appliesWhen) ?? []),
  ].filter((expression): expression is Expression => expression !== undefined)
}

function isExtensionRule(ruleId: RuleId): boolean {
  return !/^R\d{2}$/.test(ruleId)
}

function scopeIssues(
  rule: RuleDefinition,
  expression: Expression,
  scopeOf: ReadonlyMap<RuleId, RuleScope>,
  evaluationScope: RuleScope | CollectionScope = rule.scope,
): ValidationIssue[] {
  const within = (child: Expression, childScope = evaluationScope) =>
    scopeIssues(rule, child, scopeOf, childScope)
  switch (expression.op) {
    case 'ref': {
      const target = scopeOf.get(expression.ruleId)
      if (!target || target === 'order' || target === evaluationScope) return []
      return [
        {
          code: 'SCOPE_MISMATCH',
          ruleId: rule.ruleId,
          message: `${expression.ruleId} is ${target}-scoped and cannot be read in ${evaluationScope} scope without allOf/anyOf`,
        },
      ]
    }
    case 'and':
    case 'or':
      return expression.of.flatMap((child) => within(child))
    case 'not':
      return within(expression.of)
    case 'ifThen':
      return [...within(expression.condition), ...within(expression.consequence)]
    case 'allOf':
    case 'anyOf':
      if (evaluationScope !== 'order') {
        return [
          {
            code: 'SCOPE_MISMATCH',
            ruleId: rule.ruleId,
            message: `${expression.op}(${expression.scope}) is only allowed in order scope`,
          },
        ]
      }
      return within(expression.of, expression.scope)
  }
}

function referenceIssues(
  rule: RuleDefinition,
  scopeOf: ReadonlyMap<RuleId, RuleScope>,
): ValidationIssue[] {
  const declared = new Set(rule.dependsOn)
  const missing = rule.dependsOn
    .filter((ruleId) => !scopeOf.has(ruleId))
    .map(
      (ruleId): ValidationIssue => ({
        code: 'MISSING_REFERENCE',
        ruleId: rule.ruleId,
        message: `depends on unknown rule ${ruleId}`,
      }),
    )
  const undeclared = [...new Set(expressionsOf(rule).flatMap(referencedRules))]
    .filter((ruleId) => !declared.has(ruleId))
    .map(
      (ruleId): ValidationIssue => ({
        code: scopeOf.has(ruleId) ? 'UNDECLARED_DEPENDENCY' : 'MISSING_REFERENCE',
        ruleId: rule.ruleId,
        message: `expression reads ${ruleId} which is not in dependsOn`,
      }),
    )
  const scopes = expressionsOf(rule).flatMap((expression) => scopeIssues(rule, expression, scopeOf))
  return [...missing, ...undeclared, ...scopes]
}

function evaluatorIssues(
  rule: RuleDefinition,
  environment: ValidationEnvironment,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { kind, ref } = rule.evaluator
  const shapeIssue = (message: string) =>
    issues.push({ code: 'EVALUATOR_SHAPE', ruleId: rule.ruleId, message })
  if ((kind === 'combinator') !== Boolean(rule.combiner)) {
    shapeIssue('combinator rules need a combiner and other rules must not have one')
  }
  if ((kind === 'humanGate') !== Boolean(rule.humanGate)) {
    shapeIssue('humanGate rules need a humanGate and other rules must not have one')
  }
  const needsImplementation = kind === 'code' || kind === 'decisionTable' || kind === 'semantic'
  if (needsImplementation && environment.evaluatorRefs && !environment.evaluatorRefs.has(ref)) {
    issues.push({
      code: 'UNKNOWN_EVALUATOR',
      ruleId: rule.ruleId,
      message: `no ${kind} evaluator registered as ${ref}`,
    })
  }
  return issues
}

function parameterIssues(
  rule: RuleDefinition,
  environment: ValidationEnvironment,
): ValidationIssue[] {
  return rule.parameters
    .filter((parameter) => !environment.policyParameters.has(parameter))
    .map((parameter) => ({
      code: 'MISSING_PARAMETER',
      ruleId: rule.ruleId,
      message: `policy parameter ${parameter} is not defined`,
    }))
}

function applicabilityIssues(rule: RuleDefinition): ValidationIssue[] {
  if (!isExtensionRule(rule.ruleId) || rule.applicability) return []
  return [
    {
      code: 'MISSING_APPLICABILITY',
      ruleId: rule.ruleId,
      message: 'extension rules must declare applicability so they can be selected',
    },
  ]
}

export function rulesInCycles(rules: readonly RuleDefinition[]): RuleId[] {
  const known = new Set(rules.map((rule) => rule.ruleId))
  const remainingDependencies = new Map(
    rules.map((rule) => [rule.ruleId, new Set(rule.dependsOn.filter((id) => known.has(id)))]),
  )
  let progressed = true
  while (progressed) {
    progressed = false
    for (const [ruleId, dependencies] of remainingDependencies) {
      if (dependencies.size > 0) continue
      remainingDependencies.delete(ruleId)
      for (const other of remainingDependencies.values()) other.delete(ruleId)
      progressed = true
    }
  }
  return [...remainingDependencies.keys()]
}

function pairKey(categories: readonly [CargoCategory, CargoCategory]): string {
  return [...categories].sort().join('+')
}

export function mixingMatrixIssues(matrix: readonly MixingRule[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const outcomes = new Map<string, MixingRule>()
  for (const entry of matrix) {
    const key = pairKey(entry.categories)
    const existing = outcomes.get(key)
    if (
      existing &&
      (existing.outcome !== entry.outcome || existing.qualification !== entry.qualification)
    ) {
      issues.push({ code: 'MIXING_CONFLICT', message: `${key} has conflicting outcomes` })
    }
    outcomes.set(key, entry)
    if ((entry.outcome === 'requiresQualification') !== Boolean(entry.qualification)) {
      issues.push({
        code: 'MIXING_QUALIFICATION',
        message: `${key}: a qualification is required exactly when the outcome is requiresQualification`,
      })
    }
  }
  const categories = cargoCategorySchema.options
  for (const [index, first] of categories.entries()) {
    for (const second of categories.slice(index)) {
      const key = pairKey([first, second])
      if (!outcomes.has(key)) {
        issues.push({ code: 'MIXING_INCOMPLETE', message: `${key} has no mixing outcome` })
      }
    }
  }
  return issues
}

export function validateRuleSet(
  document: unknown,
  environment: ValidationEnvironment,
): RuleSetValidation {
  const parsed = ruleSetSchema.safeParse(document)
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA',
        message: `${issue.path.join('.')}: ${issue.message}`,
      })),
    }
  }
  const ruleSet = parsed.data
  const scopeOf = new Map(ruleSet.rules.map((rule) => [rule.ruleId, rule.scope]))
  const seen = new Set<RuleId>()
  const duplicates = ruleSet.rules.flatMap((rule): ValidationIssue[] => {
    if (!seen.has(rule.ruleId)) {
      seen.add(rule.ruleId)
      return []
    }
    return [{ code: 'DUPLICATE_RULE', ruleId: rule.ruleId, message: 'rule is defined twice' }]
  })
  const cycles = rulesInCycles(ruleSet.rules).map(
    (ruleId): ValidationIssue => ({
      code: 'CYCLE',
      ruleId,
      message: 'rule is part of a dependency cycle',
    }),
  )
  const issues = [
    ...duplicates,
    ...ruleSet.rules.flatMap((rule) => [
      ...referenceIssues(rule, scopeOf),
      ...evaluatorIssues(rule, environment),
      ...parameterIssues(rule, environment),
      ...applicabilityIssues(rule),
    ]),
    ...cycles,
    ...mixingMatrixIssues(ruleSet.mixingMatrix),
  ]
  return { valid: issues.length === 0, issues, ...(issues.length === 0 ? { ruleSet } : {}) }
}
