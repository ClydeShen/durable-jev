import type { CaseOrchestrator, CaseStore } from '@durable-jev/agent-core'
import type { AgentId } from '@durable-jev/contracts'

export function watchAgents(orchestrator: CaseOrchestrator, store: CaseStore, intervalMs = 2000) {
  let available: ReadonlySet<AgentId> | undefined
  const check = async () => {
    const states = await orchestrator.availability()
    const now = new Set(states.filter((state) => state.available).map((state) => state.agentId))
    const recovered =
      available !== undefined && [...now].some((agentId) => !available?.has(agentId))
    available = now
    if (!recovered) return
    for (const record of store.cases()) {
      if (!record.dispatchedAt) await orchestrator.propagate(record.shipment.caseId)
    }
  }
  const timer = setInterval(() => {
    check().catch(() => undefined)
  }, intervalMs)
  timer.unref()
}
