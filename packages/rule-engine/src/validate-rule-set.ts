import { type CargoCategory, cargoCategorySchema, type RuleId } from '@durable-jev/contracts'
import type { CollectionScope, Expression } from './expression.js'
import { feelSyntaxError, parametersReferencedBy } from './feel.js'
import {
  type MixingRule,
  type RuleDefinition,
  type RuleScope,
  type RuleSet,
  ruleSetSchema,
} from './rule-definition.js'

type ValidationIssueCode =
  | 'SCHEMA'
  | 'DUPLICATE_RULE'
  | 'MISSING_REFERENCE'
  | 'UNDECLARED_DEPENDENCY'
  | 'SCOPE_MISMATCH'
  | 'EVALUATOR_SHAPE'
  | 'UNKNOWN_EVALUATOR'
  | 'MISSING_PARAMETER'
  | 'UNDECLARED_PARAMETER'
  | 'EXPRESSION_SYNTAX'
  | 'CYCLE'
  | 'MISSING_APPLICABILITY'
  | 'SELECTION'
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
    case 'observed':
      return [expression.ruleId]
    case 'feel':
      return []
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
    case 'feel':
      return []
    case 'ref':
    case 'observed': {
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
      if (evaluationScope === expression.scope) {
        return [
          {
            code: 'SCOPE_MISMATCH',
            ruleId: rule.ruleId,
            message: `${expression.op}(${expression.scope}) cannot be nested inside its own scope`,
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

const configByKind = {
  decisionTable: 'mixing',
  combinator: 'combiner',
  humanGate: 'humanGate',
  expression: 'expression',
  semantic: 'semantic',
} as const

function evaluatorIssues(
  rule: RuleDefinition,
  environment: ValidationEnvironment,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { kind, ref } = rule.evaluator
  for (const [configuredKind, field] of Object.entries(configByKind)) {
    if ((kind === configuredKind) !== Boolean(rule[field])) {
      issues.push({
        code: 'EVALUATOR_SHAPE',
        ruleId: rule.ruleId,
        message: `${configuredKind} rules need ${field} and other rules must not have it`,
      })
    }
  }
  if (rule.humanGate?.taskType === 'OPERATION' && rule.humanGate.steps.length !== 1) {
    issues.push({
      code: 'EVALUATOR_SHAPE',
      ruleId: rule.ruleId,
      message: 'an operation gate has exactly one step; only approvals form chains',
    })
  }
  const registered = kind === 'code'
  if (registered && environment.evaluatorRefs && !environment.evaluatorRefs.has(ref)) {
    issues.push({
      code: 'UNKNOWN_EVALUATOR',
      ruleId: rule.ruleId,
      message: `no ${kind} evaluator registered as ${ref}`,
    })
  }
  return issues
}

function feelConditionsIn(expression: Expression): string[] {
  switch (expression.op) {
    case 'feel':
      return [expression.expression]
    case 'ref':
    case 'observed':
      return []
    case 'and':
    case 'or':
      return expression.of.flatMap(feelConditionsIn)
    case 'not':
    case 'allOf':
    case 'anyOf':
      return feelConditionsIn(expression.of)
    case 'ifThen':
      return [
        ...feelConditionsIn(expression.condition),
        ...feelConditionsIn(expression.consequence),
      ]
  }
}

function feelExpressionsOf(rule: RuleDefinition): string[] {
  return [
    rule.expression?.passWhen,
    rule.expression?.observe,
    rule.mixing?.categories,
    rule.mixing?.qualifications,
    ...Object.values(rule.semantic?.state ?? {}),
    ...expressionsOf(rule).flatMap(feelConditionsIn),
  ].filter((expression): expression is string => expression !== undefined)
}

type SemanticPassWhen = NonNullable<RuleDefinition['semantic']>['passWhen']

function thresholdOf(passWhen: Exclude<SemanticPassWhen, { choiceIn: unknown }>): number | string {
  if ('probabilityAtLeast' in passWhen) return passWhen.probabilityAtLeast
  if ('probabilityAtMost' in passWhen) return passWhen.probabilityAtMost
  return passWhen.selectChoicesAtLeast
}

function semanticThresholdParameter(rule: RuleDefinition): string[] {
  const passWhen = rule.semantic?.passWhen
  if (!passWhen || 'choiceIn' in passWhen) return []
  const threshold = thresholdOf(passWhen)
  return typeof threshold === 'string' ? [threshold] : []
}

function feelIssues(rule: RuleDefinition): ValidationIssue[] {
  const declared = new Set(rule.parameters)
  const thresholdIssues = semanticThresholdParameter(rule)
    .filter((name) => !declared.has(name))
    .map((name) => ({
      code: 'UNDECLARED_PARAMETER' as const,
      ruleId: rule.ruleId,
      message: `passWhen reads ${name} which is not in parameters`,
    }))
  return [
    ...thresholdIssues,
    ...feelExpressionsOf(rule).flatMap((expression): ValidationIssue[] => {
      const syntaxError = feelSyntaxError(expression)
      const undeclared = parametersReferencedBy(expression).filter((name) => !declared.has(name))
      return [
        ...(syntaxError
          ? [
              {
                code: 'EXPRESSION_SYNTAX' as const,
                ruleId: rule.ruleId,
                message: `${expression}: ${syntaxError}`,
              },
            ]
          : []),
        ...undeclared.map((name) => ({
          code: 'UNDECLARED_PARAMETER' as const,
          ruleId: rule.ruleId,
          message: `${expression} reads params.${name} which is not in parameters`,
        })),
      ]
    }),
  ]
}

function semanticIssues(rule: RuleDefinition): ValidationIssue[] {
  const semantic = rule.semantic
  if (!semantic || !('choiceIn' in semantic.passWhen)) return []
  const labels = semantic.question.kind === 'choice' ? Object.keys(semantic.question.options) : []
  return semantic.passWhen.choiceIn
    .filter((label) => !labels.includes(label))
    .map((label) => ({
      code: 'EVALUATOR_SHAPE',
      ruleId: rule.ruleId,
      message: `passWhen label ${label} is not an option of the question`,
    }))
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

function classifierLabels(ruleSet: RuleSet): string[] | undefined {
  const classifierId = ruleSet.selection?.classifierRuleId
  const classifier = ruleSet.rules.find((rule) => rule.ruleId === classifierId)
  const semantic = classifier?.semantic
  if (semantic?.question.kind !== 'choice' || !('selectChoicesAtLeast' in semantic.passWhen)) {
    return undefined
  }
  return Object.keys(semantic.question.options)
}

function selectionIssues(ruleSet: RuleSet): ValidationIssue[] {
  const labels = classifierLabels(ruleSet)
  const classifierId = ruleSet.selection?.classifierRuleId
  const issue = (ruleId: RuleId | undefined, message: string): ValidationIssue => ({
    code: 'SELECTION',
    ...(ruleId ? { ruleId } : {}),
    message,
  })
  const classifierExists = ruleSet.rules.some((rule) => rule.ruleId === classifierId)
  const setIssues =
    classifierId && classifierExists && !labels
      ? [issue(classifierId, 'the classifier must be a choice question that selects choices')]
      : []
  return [
    ...setIssues,
    ...ruleSet.rules.flatMap((rule) => {
      const groups = rule.applicability?.commodityGroups
      if (!groups) return []
      if (!classifierId || !labels) {
        return [issue(rule.ruleId, 'commodity groups need a rule set classifier')]
      }
      return [
        ...(rule.dependsOn.includes(classifierId)
          ? []
          : [issue(rule.ruleId, `selection by commodity group must depend on ${classifierId}`)]),
        ...groups
          .filter((group) => !labels.includes(group))
          .map((group) => issue(rule.ruleId, `${group} is not a label of ${classifierId}`)),
      ]
    }),
  ]
}

function rulesInCycles(rules: readonly RuleDefinition[]): RuleId[] {
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

function mixingMatrixIssues(matrix: readonly MixingRule[]): ValidationIssue[] {
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
      ...feelIssues(rule),
      ...semanticIssues(rule),
      ...applicabilityIssues(rule),
    ]),
    ...cycles,
    ...selectionIssues(ruleSet),
    ...mixingMatrixIssues(ruleSet.mixingMatrix),
  ]
  return { valid: issues.length === 0, issues, ...(issues.length === 0 ? { ruleSet } : {}) }
}
