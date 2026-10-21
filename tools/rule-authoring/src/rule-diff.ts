import { canonicalJson } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'

export interface RuleDiff {
  added: string[]
  changed: string[]
  unchanged: string[]
}

export function diffRules(
  existing: readonly RuleDefinition[],
  proposed: readonly RuleDefinition[],
): RuleDiff {
  const before = new Map(existing.map((rule) => [rule.ruleId, canonicalJson(rule)]))
  const diff: RuleDiff = { added: [], changed: [], unchanged: [] }
  for (const rule of proposed) {
    const previous = before.get(rule.ruleId)
    if (previous === undefined) diff.added.push(rule.ruleId)
    else if (previous === canonicalJson(rule)) diff.unchanged.push(rule.ruleId)
    else diff.changed.push(rule.ruleId)
  }
  return diff
}
