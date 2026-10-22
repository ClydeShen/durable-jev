import type { RuleInfo } from './api'

export interface AgentRelation {
  from: string
  to: string
  dependencies: string[]
}

export function agentRelations(rules: readonly RuleInfo[]): AgentRelation[] {
  const owners = new Map(rules.map((rule) => [rule.ruleId, rule.owner]))
  const relations = new Map<string, AgentRelation>()
  for (const rule of rules) {
    for (const dependency of rule.dependsOn) {
      const from = owners.get(dependency)
      if (!from || from === rule.owner) continue
      const key = `${from}->${rule.owner}`
      const relation = relations.get(key) ?? { from, to: rule.owner, dependencies: [] }
      relation.dependencies.push(`${dependency}→${rule.ruleId}`)
      relations.set(key, relation)
    }
  }
  return [...relations.values()]
}
