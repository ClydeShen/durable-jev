import type { Role } from '@durable-jev/contracts'
import { useEffect, useState } from 'react'
import type { Actor } from './api'
import { useStoredState } from './browser-storage'
import { CaseTop } from './components/CaseTop'
import { CaseViews } from './components/CaseViews'
import { ConsoleLinks } from './components/chips'
import { NewOrder } from './components/NewOrder'
import { RoleBar } from './components/RoleBar'
import { Sidebar } from './components/Sidebar'
import { TaskPanel } from './components/TaskPanel'
import { demoOperators } from './labels'
import type { PlaybackSpeed } from './playback'
import { useActions } from './use-actions'
import { useCaseSelection } from './use-case-selection'
import { useConsoleData } from './use-console-data'

export function App() {
  const [actor, setActor] = useState<Actor>({
    id: demoOperators.warehouseOperator,
    role: 'warehouseOperator',
  })
  const selection = useCaseSelection()
  const { showFirst } = selection
  const [message, setMessage] = useState<string>()
  const [openAgent, setOpenAgent] = useState<string>()
  // A new object per click, so asking for the same rule again still moves the view.
  const [ruleRequest, setRuleRequest] = useState<{ ruleIds: string[] }>()
  const [speed, setSpeed] = useStoredState<PlaybackSpeed>('playback-speed', 'realtime')

  const { rules, cases, agents, agentNames, detail, tasks, refreshAll } = useConsoleData(
    selection.caseId,
    actor.role,
  )

  useEffect(() => {
    if (!selection.caseId && cases.data?.[0]) showFirst(cases.data[0].caseId)
  }, [cases.data, selection.caseId, showFirst])

  const caseId = detail.data?.caseId
  const actions = useActions(actor, setMessage, refreshAll)

  const showRule = (inCase: string, ruleId: string) => {
    setOpenAgent(undefined)
    selection.show(inCase)
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
          selectedCase={selection.caseId}
          onSelectCase={selection.show}
          onNewOrder={selection.openOrderForm}
          agents={agents.data ?? []}
          canControl={actor.role === 'technicalEvaluator'}
          onOpenAgent={setOpenAgent}
          onControl={actions.controlService}
        />
        <main>
          {selection.ordering && (
            <NewOrder
              onSubmit={(sampleId, shipment) =>
                actions.submitOrder(sampleId, shipment, selection.showSubmitted)
              }
              onCancel={selection.closeOrderForm}
            />
          )}
          {!selection.ordering && detail.data && caseId && (
            <>
              <CaseTop
                detail={detail.data}
                actor={actor}
                rules={rules}
                actions={actions}
                onShowRule={(ruleId) => showRule(caseId, ruleId)}
                onReset={() => actions.resetCase(caseId, selection.showSubmitted)}
              />
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
                fromStart={selection.isFresh(caseId)}
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
          onSelectCase={selection.show}
          onShowRule={showRule}
          onDecide={actions.decide}
        />
      </div>
    </ConsoleLinks.Provider>
  )
}
