import type { Role } from '@durable-jev/contracts'
import { useEffect, useState } from 'react'
import type { Actor } from './api'
import { useStoredState } from './browser-storage'
import { CaseHeader } from './components/CaseHeader'
import { CaseViews } from './components/CaseViews'
import { ConsoleLinks } from './components/chips'
import { InvestigationPanel } from './components/InvestigationPanel'
import { NextSteps } from './components/NextSteps'
import { RoleBar } from './components/RoleBar'
import { Sidebar } from './components/Sidebar'
import { TaskPanel } from './components/TaskPanel'
import { demoOperators } from './labels'
import type { PlaybackSpeed } from './playback'
import { useActions } from './use-actions'
import { useConsoleData } from './use-console-data'

export function App() {
  const [actor, setActor] = useState<Actor>({
    id: demoOperators.warehouseOperator,
    role: 'warehouseOperator',
  })
  const [selectedCase, setSelectedCase] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [openAgent, setOpenAgent] = useState<string>()
  // A new object per click, so asking for the same rule again still moves the view.
  const [ruleRequest, setRuleRequest] = useState<{ ruleIds: string[] }>()
  const [speed, setSpeed] = useStoredState<PlaybackSpeed>('playback-speed', 'realtime')

  const { rules, cases, agents, agentNames, detail, tasks, refreshAll } = useConsoleData(
    selectedCase,
    actor.role,
  )

  useEffect(() => {
    if (!selectedCase && cases.data?.[0]) setSelectedCase(cases.data[0].caseId)
  }, [cases.data, selectedCase])

  const caseId = detail.data?.caseId
  const actions = useActions(actor, setMessage, refreshAll)

  const showRule = (inCase: string, ruleId: string) => {
    setOpenAgent(undefined)
    setSelectedCase(inCase)
    setRuleRequest({ ruleIds: [ruleId] })
  }
  const links = {
    currentRole: actor.role,
    switchRole: (role: Role) => setActor({ role, id: demoOperators[role] }),
    openAgent: setOpenAgent,
  }

  return (
    <ConsoleLinks.Provider value={links}>
      <div className="app" data-role={actor.role}>
        <RoleBar actor={actor} onChange={setActor} onReset={actions.reset} />
        <Sidebar
          speed={speed}
          onSpeed={setSpeed}
          cases={cases.data ?? []}
          selectedCase={selectedCase}
          onSelectCase={setSelectedCase}
          agents={agents.data ?? []}
          canControl={actor.role === 'technicalEvaluator'}
          onOpenAgent={setOpenAgent}
          onControl={actions.controlService}
        />
        <main>
          {detail.data && caseId && (
            <>
              <CaseHeader
                detail={detail.data}
                actor={actor}
                onDispatch={() => actions.dispatch(caseId)}
                onRevise={(index) => actions.revise(caseId, index)}
                onReportIncident={(index) => actions.reportIncident(caseId, index)}
              />
              <NextSteps
                detail={detail.data}
                rules={rules}
                onShowRule={(ruleId) => showRule(caseId, ruleId)}
              />
              {detail.data.investigations.length > 0 && (
                <InvestigationPanel
                  investigations={detail.data.investigations}
                  actor={actor}
                  onDecide={actions.decideProposal}
                />
              )}
              <CaseViews
                caseId={detail.data.caseId}
                outcomes={detail.data.outcomes}
                openTasks={detail.data.tasks.filter((task) => task.status === 'OPEN')}
                agents={agents.data ?? []}
                agentNames={agentNames}
                rules={rules}
                openAgent={openAgent}
                onOpenAgent={setOpenAgent}
                speed={speed}
                ruleRequest={ruleRequest}
              />
            </>
          )}
        </main>
        <TaskPanel
          actor={actor}
          tasks={tasks.data ?? []}
          rules={rules}
          caseId={caseId}
          message={message}
          onSelectCase={setSelectedCase}
          onShowRule={showRule}
          onDecide={actions.decide}
        />
      </div>
    </ConsoleLinks.Provider>
  )
}
