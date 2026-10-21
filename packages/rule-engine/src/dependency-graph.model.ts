import type { RuleId } from '@durable-jev/contracts'
import { referencedRuleIds } from './expression.types.js'
import type { RuleDefinition } from './rule-definition.schema.js'

export function upstreamRuleIds(rule: RuleDefinition): RuleId[] {
  const referenced = [
    ...rule.dependsOn,
    ...(rule.combiner ? referencedRuleIds(rule.combiner) : []),
    ...(rule.appliesWhen ? referencedRuleIds(rule.appliesWhen) : []),
  ]
  return [...new Set(referenced)]
}

export type TopologicalOrder = { order: RuleId[]; cyclicRuleIds: RuleId[] }

export function orderRulesTopologically(rules: readonly RuleDefinition[]): TopologicalOrder {
  const knownRuleIds = new Set(rules.map((rule) => rule.ruleId))
  const remainingUpstreamCount = new Map<RuleId, number>()
  const downstreamOf = new Map<RuleId, RuleId[]>()

  for (const rule of rules) {
    const upstream = upstreamRuleIds(rule).filter((ruleId) => knownRuleIds.has(ruleId))
    remainingUpstreamCount.set(rule.ruleId, upstream.length)
    for (const upstreamRuleId of upstream) {
      downstreamOf.set(upstreamRuleId, [...(downstreamOf.get(upstreamRuleId) ?? []), rule.ruleId])
    }
  }

  const ready = rules
    .map((rule) => rule.ruleId)
    .filter((id) => remainingUpstreamCount.get(id) === 0)
  const order: RuleId[] = []
  while (ready.length > 0) {
    const ruleId = ready.shift() as RuleId
    order.push(ruleId)
    for (const downstreamRuleId of downstreamOf.get(ruleId) ?? []) {
      const remaining = (remainingUpstreamCount.get(downstreamRuleId) ?? 0) - 1
      remainingUpstreamCount.set(downstreamRuleId, remaining)
      if (remaining === 0) ready.push(downstreamRuleId)
    }
  }

  const ordered = new Set(order)
  const cyclicRuleIds = rules.map((rule) => rule.ruleId).filter((id) => !ordered.has(id))
  return { order, cyclicRuleIds }
}
