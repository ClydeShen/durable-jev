import type { HumanTask } from '@durable-jev/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Actor, type AgentNames, api, type RuleInfo, type TaskDecision } from './api'
import { AgentPanel } from './components/AgentPanel'
import { CaseHeader } from './components/CaseHeader'
import { CaseList } from './components/CaseList'
import { CaseViews } from './components/CaseViews'
import { InvestigationPanel } from './components/InvestigationPanel'
import { RoleBar } from './components/RoleBar'
import { TaskPanel } from './components/TaskPanel'
import { usePolling } from './use-polling'

export function App() {
  const [actor, setActor] = useState<Actor>({ id: 'wen', role: 'warehouseOperator' })
  const [selectedCase, setSelectedCase] = useState<string>()
  const [message, setMessage] = useState<string>()
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
  const loadTasks = useCallback(() => api.tasks(actor.role), [actor.role])
  const tasks = usePolling(loadTasks)

  useEffect(() => {
    if (!selectedCase && cases.data?.[0]) setSelectedCase(cases.data[0].caseId)
  }, [cases.data, selectedCase])

  const refreshAll = () =>
    Promise.all([cases.refresh(), detail.refresh(), tasks.refresh(), agents.refresh()])
  const report = async (work: () => Promise<unknown>, success: string) => {
    try {
      await work()
      setMessage(success)
    } catch (failure) {
      setMessage(String(failure))
    }
    await refreshAll()
  }
  const decide = (task: HumanTask, decision: TaskDecision) =>
    report(() => api.decide(task.humanTaskId, decision, actor), `${task.ruleId} 已提交`)

  return (
    <div className="app">
      <RoleBar
        actor={actor}
        onChange={setActor}
        onReset={() => report(() => api.reset(), '演示数据已重置')}
      />
      <aside className="sidebar">
        <CaseList cases={cases.data ?? []} selected={selectedCase} onSelect={setSelectedCase} />
        <AgentPanel
          agents={agents.data ?? []}
          canControl={actor.role === 'technicalEvaluator'}
          onControl={(agentId, verb) =>
            report(
              () => api.controlService(agentId, verb),
              verb === 'crash' ? `${agentId} 已终止` : `${agentId} 正在重启`,
            )
          }
        />
      </aside>
      <main>
        {detail.data && (
          <>
            <CaseHeader
              detail={detail.data}
              actor={actor}
              onDispatch={() =>
                report(() => api.dispatch(detail.data?.caseId ?? '', actor), '已确认发运')
              }
              onRevise={(index) =>
                report(() => api.revise(detail.data?.caseId ?? '', index), '已应用变更并重新评估')
              }
              onReportIncident={(index) =>
                report(
                  () => api.reportIncident(detail.data?.caseId ?? '', index),
                  '已通知运输 agent，调查助手开始调查',
                )
              }
            />
            {detail.data.investigations.length > 0 && (
              <InvestigationPanel
                investigations={detail.data.investigations}
                actor={actor}
                onDecide={(investigation, type) =>
                  report(
                    () => api.decideProposal(investigation.investigationId, type, actor),
                    type === 'confirm' ? '已确认改派，相关 agent 正在重新评估' : '已否决改派提议',
                  )
                }
              />
            )}
            <CaseViews
              caseId={detail.data.caseId}
              outcomes={detail.data.outcomes}
              agents={agents.data ?? []}
              agentNames={agentNames}
              rules={rules}
            />
          </>
        )}
      </main>
      <TaskPanel actor={actor} tasks={tasks.data ?? []} message={message} onDecide={decide} />
    </div>
  )
}
