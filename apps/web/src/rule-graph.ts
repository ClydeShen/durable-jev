import type { Expression, RuleDefinition } from '@durable-jev/rule-engine'

function referencedRuleIds(expression: Expression): string[] {
  switch (expression.kind) {
    case 'ref':
      return [expression.ruleId]
    case 'and':
    case 'or':
      return expression.operands.flatMap(referencedRuleIds)
    case 'not':
      return referencedRuleIds(expression.operand)
    case 'ifThen':
      return [
        ...referencedRuleIds(expression.condition),
        ...referencedRuleIds(expression.consequence),
      ]
    case 'allOf':
    case 'anyOf':
      return referencedRuleIds(expression.expression)
  }
}

export function upstreamOf(rule: RuleDefinition): string[] {
  return [
    ...new Set([
      ...rule.dependsOn,
      ...(rule.combiner ? referencedRuleIds(rule.combiner) : []),
      ...(rule.appliesWhen ? referencedRuleIds(rule.appliesWhen) : []),
    ]),
  ]
}
