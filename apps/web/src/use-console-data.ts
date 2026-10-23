import type { Role } from '@durable-jev/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type AgentNames, api, type RuleInfo } from './api'
import { usePolling } from './use-polling'

/** Everything the console shows, kept fresh by polling: cases, agents, the open case, tasks. */
export function useConsoleData(selectedCase: string | undefined, role: Role) {
  const [rules, setRules] = useState<RuleInfo[]>([])
  useEffect(() => {
    void api.rules().then((response) => setRules(response.rules))
  }, [])
  const cases = usePolling(api.cases)
  const agents = usePolling(api.agents)
  const agentNames = useMemo<AgentNames>(
    () =>
      Object.fromEntries(
        (agents.data ?? []).map((agent) => [agent.agentId, agent.card?.name ?? agent.agentId]),
      ),
    [agents.data],
  )
  const loadDetail = useCallback(
    () => (selectedCase ? api.caseDetail(selectedCase) : Promise.resolve(undefined)),
    [selectedCase],
  )
  const detail = usePolling(loadDetail)
  const loadTasks = useCallback(() => api.tasks(role), [role])
  const tasks = usePolling(loadTasks)
  const refreshAll = () =>
    Promise.all([cases.refresh(), detail.refresh(), tasks.refresh(), agents.refresh()])
  return { rules, cases, agents, agentNames, detail, tasks, refreshAll }
}
