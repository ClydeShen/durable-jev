import type { RuleId, RuleScope } from '@durable-jev/contracts'
import { orderRulesTopologically, upstreamRuleIds } from './dependency-graph.js'
import type { Expression } from './expression.js'
import { type RuleDefinition, RuleSet } from './rule-definition.js'

export type ConfigIssue =
  | { kind: 'invalidSchema'; path: string; message: string }
  | { kind: 'duplicateRule'; ruleId: RuleId }
  | { kind: 'missingReference'; ruleId: RuleId; missingRuleId: RuleId }
  | { kind: 'typeMismatch'; ruleId: RuleId; message: string }
  | { kind: 'cycle'; ruleIds: RuleId[] }
  | { kind: 'missingParameter'; ruleId: RuleId; parameter: string }

export type RuleSetValidation =
  | { valid: true; rules: RuleSet; evaluationOrder: RuleId[] }
  | { valid: false; issues: ConfigIssue[] }

export function validateRuleSet(
  rawRules: unknown,
  policyParameters: Readonly<Record<string, unknown>>,
): RuleSetValidation {
  const parsed = RuleSet.safeParse(rawRules)
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        kind: 'invalidSchema',
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }

  const rules = parsed.data
  const rulesById = new Map(rules.map((rule) => [rule.ruleId, rule]))
  const issues: ConfigIssue[] = [
    ...findDuplicateRules(rules),
    ...rules.flatMap((rule) => findMissingReferences(rule, rulesById)),
    ...rules.flatMap((rule) => findTypeMismatches(rule, rulesById)),
    ...rules.flatMap((rule) => findMissingParameters(rule, policyParameters)),
  ]

  const { order, cyclicRuleIds } = orderRulesTopologically(rules)
  if (cyclicRuleIds.length > 0) issues.push({ kind: 'cycle', ruleIds: cyclicRuleIds })

  return issues.length === 0
    ? { valid: true, rules, evaluationOrder: order }
    : { valid: false, issues }
}

function findDuplicateRules(rules: readonly RuleDefinition[]): ConfigIssue[] {
  const seen = new Set<RuleId>()
  const duplicates = new Set<RuleId>()
  for (const rule of rules) {
    if (seen.has(rule.ruleId)) duplicates.add(rule.ruleId)
    seen.add(rule.ruleId)
  }
  return [...duplicates].map((ruleId) => ({ kind: 'duplicateRule', ruleId }))
}

function findMissingReferences(
  rule: RuleDefinition,
  rulesById: ReadonlyMap<RuleId, RuleDefinition>,
): ConfigIssue[] {
  return upstreamRuleIds(rule)
    .filter((upstreamRuleId) => !rulesById.has(upstreamRuleId))
    .map((missingRuleId) => ({ kind: 'missingReference', ruleId: rule.ruleId, missingRuleId }))
}

function findMissingParameters(
  rule: RuleDefinition,
  policyParameters: Readonly<Record<string, unknown>>,
): ConfigIssue[] {
  return rule.parameters
    .filter((parameter) => !Object.hasOwn(policyParameters, parameter))
    .map((parameter) => ({ kind: 'missingParameter', ruleId: rule.ruleId, parameter }))
}

function findTypeMismatches(
  rule: RuleDefinition,
  rulesById: ReadonlyMap<RuleId, RuleDefinition>,
): ConfigIssue[] {
  const mismatch = (message: string): ConfigIssue => ({
    kind: 'typeMismatch',
    ruleId: rule.ruleId,
    message,
  })
  const issues: ConfigIssue[] = []

  if (rule.evaluator.kind === 'combinator' && !rule.combiner) {
    issues.push(mismatch('combinator evaluator requires a combiner expression'))
  }
  if (rule.evaluator.kind !== 'combinator' && rule.combiner) {
    issues.push(mismatch(`${rule.evaluator.kind} evaluator must not define a combiner`))
  }
  if (rule.evaluator.kind === 'humanGate' && !rule.humanGate) {
    issues.push(mismatch('humanGate evaluator requires a humanGate definition'))
  }
  if (rule.unknownPolicy === 'escalateToHuman' && !rule.humanGate) {
    issues.push(mismatch('escalateToHuman requires a humanGate naming the reviewer role'))
  }

  for (const expression of [rule.combiner, rule.appliesWhen]) {
    if (!expression) continue
    issues.push(...findScopeMismatches(expression, rule.scope, rulesById).map(mismatch))
  }
  return issues
}

function findScopeMismatches(
  expression: Expression,
  evaluationScope: RuleScope,
  rulesById: ReadonlyMap<RuleId, RuleDefinition>,
): string[] {
  const recurse = (inner: Expression) => findScopeMismatches(inner, evaluationScope, rulesById)
  switch (expression.kind) {
    case 'ref': {
      const referencedScope = rulesById.get(expression.ruleId)?.scope
      if (!referencedScope || referencedScope === 'order' || referencedScope === evaluationScope) {
        return []
      }
      return [
        `${expression.ruleId} has scope ${referencedScope} and needs allOf/anyOf from scope ${evaluationScope}`,
      ]
    }
    case 'and':
    case 'or':
      return expression.operands.flatMap(recurse)
    case 'not':
      return recurse(expression.operand)
    case 'ifThen':
      return [...recurse(expression.condition), ...recurse(expression.consequence)]
    case 'allOf':
    case 'anyOf':
      if (evaluationScope !== 'order') {
        return [`${expression.kind}(${expression.scope}) is only allowed from order scope`]
      }
      return findScopeMismatches(expression.expression, expression.scope, rulesById)
  }
}
