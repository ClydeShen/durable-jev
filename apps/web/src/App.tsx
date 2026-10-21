import type { HumanTask } from '@durable-jev/contracts'
import { useCallback, useEffect, useState } from 'react'
import { type Actor, api, type RuleInfo, type TaskDecision } from './api'
import { AgentOverview } from './components/AgentOverview'
import { AgentPanel } from './components/AgentPanel'
import { CaseHeader } from './components/CaseHeader'
import { CaseList } from './components/CaseList'
import { RoleBar } from './components/RoleBar'
import { RuleDetail } from './components/RuleDetail'
import { RuleGraph } from './components/RuleGraph'
import { TaskPanel } from './components/TaskPanel'
import { Timeline } from './components/Timeline'
import { agentLabels } from './labels'
import { usePolling } from './use-polling'

type CaseViewMode = 'overview' | 'graph' | 'timeline'

const viewModes: [CaseViewMode, string][] = [
  ['overview', 'Agent 总览'],
  ['graph', '规则图'],
  ['timeline', '时间线'],
]

export function App() {
  const [actor, setActor] = useState<Actor>({ id: 'wen', role: 'warehouseOperator' })
  const [selectedCase, setSelectedCase] = useState<string>()
  const [selectedRule, setSelectedRule] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [rules, setRules] = useState<RuleInfo[]>([])
  const [view, setView] = useState<CaseViewMode>('overview')
  const [focusAgent, setFocusAgent] = useState<string>()

  useEffect(() => {
    api.rules().then((response) => setRules(response.rules))
  }, [])
  const cases = usePolling(api.cases)
  const agents = usePolling(api.agents)
  const loadDetail = useCallback(
    () => (selectedCase ? api.caseDetail(selectedCase) : Promise.resolve(undefined)),
    [selectedCase],
  )
  const detail = usePolling(loadDetail)
  const loadTimeline = useCallback(
    () => (selectedCase && view === 'timeline' ? api.timeline(selectedCase) : Promise.resolve([])),
    [selectedCase, view],
  )
  const timeline = usePolling(loadTimeline)
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

  const rule = rules.find((candidate) => candidate.ruleId === selectedRule)
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
            />
            <nav className="view-tabs">
              {viewModes.map(([mode, label]) => (
                <button
                  type="button"
                  key={mode}
                  className={view === mode ? '' : 'secondary'}
                  onClick={() => setView(mode)}
                >
                  {label}
                </button>
              ))}
              {view === 'graph' && focusAgent && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setFocusAgent(undefined)}
                >
                  仅 {agentLabels[focusAgent] ?? focusAgent} ✕
                </button>
              )}
            </nav>
            {view === 'overview' && (
              <AgentOverview
                agents={agents.data ?? []}
                rules={rules}
                outcomes={detail.data.outcomes}
                onOpenAgent={(agentId) => {
                  setFocusAgent(agentId)
                  setView('graph')
                }}
              />
            )}
            {view === 'graph' && (
              <RuleGraph
                rules={rules}
                outcomes={detail.data.outcomes}
                focusAgent={focusAgent}
                onSelect={setSelectedRule}
              />
            )}
            {view === 'timeline' && <Timeline entries={timeline.data ?? []} />}
            {rule && (
              <RuleDetail
                rule={rule}
                outcomes={detail.data.outcomes.filter((outcome) => outcome.ruleId === rule.ruleId)}
                onClose={() => setSelectedRule(undefined)}
              />
            )}
          </>
        )}
      </main>
      <TaskPanel actor={actor} tasks={tasks.data ?? []} message={message} onDecide={decide} />
    </div>
  )
}
