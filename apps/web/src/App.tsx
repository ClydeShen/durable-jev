import type { HumanTask, Role } from '@durable-jev/contracts'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type CaseSummary, type CaseView, type RuleCatalog } from './api.js'
import { CaseList } from './CaseList.js'
import { HumanTaskPanel } from './HumanTaskPanel.js'
import { RuleTree } from './RuleTree.js'
import { roleLabels, roles } from './roles.js'
import { ShipmentSummary } from './ShipmentSummary.js'
import { StatusBadge } from './StatusBadge.js'

const refreshIntervalMs = 2000

export function App() {
  const [actingRole, setActingRole] = useState<Role>('WAREHOUSE_OPERATOR')
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string>()
  const [selectedCase, setSelectedCase] = useState<CaseView>()
  const [catalog, setCatalog] = useState<RuleCatalog>()
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string }>()

  const refresh = useCallback(async () => {
    try {
      const latestCases = await api.listCases()
      setCases(latestCases)
      const caseId = selectedCaseId ?? latestCases[0]?.caseId
      if (caseId) {
        setSelectedCaseId(caseId)
        setSelectedCase(await api.getCase(caseId))
      }
    } catch (error) {
      setMessage({ kind: 'error', text: `Cannot reach the coordinator: ${String(error)}` })
    }
  }, [selectedCaseId])

  useEffect(() => {
    api.listRules().then(setCatalog, () => {})
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refresh])

  const run = async (description: string, action: () => Promise<unknown>) => {
    try {
      await action()
      setMessage({ kind: 'info', text: `${description}: done` })
    } catch (error) {
      const text = error instanceof ApiError ? `${error.status} ${error.message}` : String(error)
      setMessage({ kind: 'error', text: `${description}: ${text}` })
    }
    await refresh()
  }

  const caseId = selectedCase?.caseId ?? ''
  const taskActions = {
    approve: (task: HumanTask) =>
      run(`Approve ${task.ruleId}`, () => api.approve(task.humanTaskId, actingRole)),
    reject: (task: HumanTask, reason: string) =>
      run(`Reject ${task.ruleId}`, () => api.reject(task.humanTaskId, actingRole, reason)),
    complete: (task: HumanTask, fields: Record<string, string>) =>
      run(`Complete ${task.ruleId}`, () => api.complete(task.humanTaskId, actingRole, fields)),
    dispatch: () => run('Confirm dispatch', () => api.dispatch(caseId, actingRole)),
  }

  return (
    <div className="layout">
      <header className="topbar">
        <h1>Dispatch Workbench</h1>
        <label>
          Acting as
          <select
            value={actingRole}
            onChange={(event) => setActingRole(event.target.value as Role)}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            run('Reset demo', async () => {
              setSelectedCaseId(undefined)
              await api.resetDemo()
            })
          }
        >
          Reset demo
        </button>
      </header>

      {message && (
        <div className={`message message-${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      <aside className="sidebar">
        <h2>Cases</h2>
        <CaseList cases={cases} selectedCaseId={selectedCaseId} onSelect={setSelectedCaseId} />
      </aside>

      <main className="content">
        {selectedCase ? (
          <>
            <div className="case-header">
              <h2>{selectedCase.shipment.shipmentId}</h2>
              <StatusBadge status={selectedCase.orderStatus} />
              <span className="muted small">{selectedCase.correlationId}</span>
            </div>
            <div className="columns">
              <section>
                <h2>Rule tree</h2>
                {catalog ? (
                  <RuleTree rootRuleId="R40" rules={catalog.rules} checks={selectedCase.checks} />
                ) : (
                  <p className="muted">Loading rules…</p>
                )}
              </section>
              <div>
                <HumanTaskPanel
                  tasks={selectedCase.humanTasks}
                  actingRole={actingRole}
                  actions={taskActions}
                />
                <ShipmentSummary shipment={selectedCase.shipment} />
              </div>
            </div>
          </>
        ) : (
          <p className="muted">Select a case on the left.</p>
        )}
      </main>
    </div>
  )
}
