import type { RuleId } from '@durable-jev/contracts'
import type { InvalidationTrigger, RuleDefinition, RuleSet } from './rule-definition.js'

export interface EntityChange {
  changeId: string
  entities: readonly InvalidationTrigger[]
}

function dependentsByRule(rules: readonly RuleDefinition[]): Map<RuleId, RuleId[]> {
  const dependents = new Map<RuleId, RuleId[]>()
  for (const rule of rules) {
    for (const dependency of rule.dependsOn) {
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), rule.ruleId])
    }
  }
  return dependents
}

export function invalidateDependentsOf(ruleSet: RuleSet, change: EntityChange): Set<RuleId> {
  const changed = new Set(change.entities)
  const affected = new Set(
    ruleSet.rules
      .filter((rule) => rule.invalidationTriggers.some((trigger) => changed.has(trigger)))
      .map((rule) => rule.ruleId),
  )
  const dependents = dependentsByRule(ruleSet.rules)
  const pending = [...affected]
  for (let ruleId = pending.pop(); ruleId !== undefined; ruleId = pending.pop()) {
    for (const dependent of dependents.get(ruleId) ?? []) {
      if (affected.has(dependent)) continue
      affected.add(dependent)
      pending.push(dependent)
    }
  }
  return affected
}
