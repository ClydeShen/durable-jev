import type { AgentId, Role, RuleEngineKind } from '@durable-jev/contracts'
import type { CaseStore } from './case-store.js'
import type { RulePack } from './rule-pack.js'

export interface AgentSummary {
  agentId: AgentId
  rulePackVersion: string
  rulesByKind: Partial<Record<RuleEngineKind, number>>
  cases: number
  openTasksByRole: Partial<Record<Role, number>>
}

function countBy<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
  const counts: Partial<Record<T, number>> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

export function agentSummary(agentId: AgentId, rulePack: RulePack, store: CaseStore): AgentSummary {
  const owned = rulePack.ruleSet.rules.filter((rule) => rule.owner === agentId)
  return {
    agentId,
    rulePackVersion: `${rulePack.policyVersion}/${rulePack.ruleSet.ruleSetVersion}`,
    rulesByKind: countBy(owned.map((rule) => rule.evaluator.kind)),
    cases: store.cases().length,
    openTasksByRole: countBy(store.openTasks().map((task) => task.requiredRole)),
  }
}
