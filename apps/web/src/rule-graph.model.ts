import type { Expression, RuleDefinition } from '@durable-jev/rule-engine'

const referencedRuleIds = (expression: Expression): string[] => {
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

export const upstreamOf = (rule: RuleDefinition): string[] => {
  return [
    ...new Set([
      ...rule.dependsOn,
      ...(rule.combiner ? referencedRuleIds(rule.combiner) : []),
      ...(rule.appliesWhen ? referencedRuleIds(rule.appliesWhen) : []),
    ]),
  ]
}

type BlockingCheck = { ruleId: string; gateStatus: string; blockedBy: readonly string[] }

export const rootBlockers = (
  blockedBy: readonly string[],
  checksByRule: ReadonlyMap<string, readonly BlockingCheck[]>,
): string[] => {
  const roots = new Set<string>()
  const visited = new Set<string>()
  const pending = [...blockedBy]
  while (pending.length > 0) {
    const ruleId = pending.pop() as string
    if (visited.has(ruleId)) continue
    visited.add(ruleId)
    const blockedChecks = (checksByRule.get(ruleId) ?? []).filter(
      (check) => check.gateStatus === 'BLOCKED_DEPENDENCY' && check.blockedBy.length > 0,
    )
    if (blockedChecks.length === 0) roots.add(ruleId)
    for (const check of blockedChecks) pending.push(...check.blockedBy)
  }
  return [...roots]
}
