import type { HumanTask, PlanChange, ReferenceData, Role } from '@durable-jev/contracts'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type CaseSummary, type CaseView, type RuleCatalog } from './api.js'
import { CaseList } from './CaseList.js'
import { DemoControls } from './DemoControls.js'
import { FlowDiagram } from './flow/FlowDiagram.js'
import { HumanTaskPanel } from './HumanTaskPanel.js'
import { InvestigationPanel } from './InvestigationPanel.js'
import { PlanChangePanel } from './PlanChangePanel.js'
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
  const [referenceData, setReferenceData] = useState<ReferenceData>()
  const [view, setView] = useState<'flow' | 'tree'>('flow')
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string }>()
  // The action in flight. While it runs the action panels are disabled, so a slow service
  // never looks like a frozen page and nothing is sent twice by an impatient second click.
  const [busy, setBusy] = useState<string>()
  const [lastAction, setLastAction] = useState<{
    description: string
    action: () => Promise<unknown>
  }>()

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
      const detail = error instanceof ApiError ? `HTTP ${error.status}` : String(error)
      setMessage({
        kind: 'error',
        text: `Cannot reach the coordinator (${detail}). If it was stopped, start it under Demo controls.`,
      })
    }
  }, [selectedCaseId])

  useEffect(() => {
    api.listRules().then(setCatalog, () => {})
    api.referenceData().then(setReferenceData, () => {})
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refresh])

  // Business actions are remembered so the demo controls can send the same one again.
  const run = async (description: string, action: () => Promise<unknown>, remember = true) => {
    if (remember) setLastAction({ description, action })
    setBusy(description)
    try {
      await action()
      setMessage({ kind: 'info', text: `${description}: done` })
    } catch (error) {
      const text = error instanceof ApiError ? `${error.status} ${error.message}` : String(error)
      setMessage({ kind: 'error', text: `${description}: ${text}` })
    }
    setBusy(undefined)
    await refresh()
  }

  const caseId = selectedCase?.caseId ?? ''
  const taskActions = {
    approve: (task: HumanTask, conditions?: string[]) =>
      run(`Approve ${task.ruleId}`, () => api.approve(task.humanTaskId, actingRole, conditions)),
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
            run(
              'Reset demo',
              async () => {
                setSelectedCaseId(undefined)
                setLastAction(undefined)
                await api.resetDemo()
              },
              false,
            )
          }
        >
          Reset demo
        </button>
      </header>

      {busy ? (
        <div className="message message-busy" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Working: {busy}…
        </div>
      ) : (
        message && (
          <div className={`message message-${message.kind}`} role="status">
            {message.text}
          </div>
        )
      )}

      <aside className="sidebar">
        <h2>Cases</h2>
        <CaseList cases={cases} selectedCaseId={selectedCaseId} onSelect={setSelectedCaseId} />
        <DemoControls
          run={(description, action) => run(description, action, false)}
          lastAction={lastAction?.description}
          resendLastAction={async () => {
            if (lastAction)
              await run(`${lastAction.description} (sent again)`, lastAction.action, false)
          }}
        />
      </aside>

      <main className="content">
        {selectedCase ? (
          <>
            <div className="case-header">
              <h2>{selectedCase.shipment.shipmentId}</h2>
              <StatusBadge status={selectedCase.orderStatus} />
              <span className="muted small">{selectedCase.correlationId}</span>
              {(selectedCase.orderStatus === 'TECHNICAL_FAILURE' ||
                selectedCase.orderStatus === 'SUBMITTED') && (
                <button
                  type="button"
                  onClick={() => run('Re-evaluate', () => api.reevaluate(selectedCase.caseId))}
                >
                  Re-evaluate
                </button>
              )}
            </div>
            <section>
              <div className="view-tabs">
                {(['flow', 'tree'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                  >
                    {option === 'flow' ? 'Flow' : 'Rule tree'}
                  </button>
                ))}
              </div>
              {!catalog ? (
                <p className="muted">Loading rules…</p>
              ) : view === 'flow' ? (
                <FlowDiagram
                  rules={catalog.rules}
                  checks={selectedCase.checks}
                  humanTasks={selectedCase.humanTasks}
                />
              ) : (
                <RuleTree
                  rootRuleId="R40"
                  rules={catalog.rules}
                  checks={selectedCase.checks}
                  humanTasks={selectedCase.humanTasks}
                />
              )}
            </section>
            <fieldset
              className="actions"
              disabled={busy !== undefined}
              aria-busy={busy !== undefined}
            >
              <div className="columns columns-even">
                <div>
                  <HumanTaskPanel
                    tasks={selectedCase.humanTasks}
                    actingRole={actingRole}
                    actions={taskActions}
                    decisionConditionsByRule={
                      new Map(
                        (catalog?.rules ?? []).map((rule) => [
                          rule.ruleId as string,
                          rule.humanGate?.decisionConditions ?? [],
                        ]),
                      )
                    }
                  />
                  <PlanChangePanel
                    key={`${selectedCase.caseId}:${selectedCase.shipment.caseRevision}`}
                    shipment={selectedCase.shipment}
                    changes={selectedCase.changes}
                    referenceData={referenceData}
                    actingRole={actingRole}
                    disabled={
                      selectedCase.orderStatus === 'DISPATCHED' ||
                      selectedCase.orderStatus === 'REJECTED'
                    }
                    applyChange={(change: PlanChange) =>
                      run('Apply change', () =>
                        api.applyChange(
                          caseId,
                          change,
                          actingRole,
                          selectedCase.shipment.caseRevision,
                        ),
                      )
                    }
                  />
                  <InvestigationPanel
                    shipment={selectedCase.shipment}
                    investigations={selectedCase.investigations}
                    referenceData={referenceData}
                    actingRole={actingRole}
                    disabled={
                      selectedCase.orderStatus === 'DISPATCHED' ||
                      selectedCase.orderStatus === 'REJECTED'
                    }
                    actions={{
                      investigate: (body) =>
                        run('Find replacement carrier', () =>
                          api.investigate(caseId, body, actingRole),
                        ),
                      accept: (investigation) =>
                        run('Accept proposal', () =>
                          api.acceptInvestigation(investigation.investigationId, actingRole),
                        ),
                      reject: (investigation, reason) =>
                        run('Reject proposal', () =>
                          api.rejectInvestigation(
                            investigation.investigationId,
                            actingRole,
                            reason,
                          ),
                        ),
                    }}
                  />
                  <ShipmentSummary shipment={selectedCase.shipment} />
                </div>
              </div>
            </fieldset>
          </>
        ) : (
          <p className="muted">Select a case on the left.</p>
        )}
      </main>
    </div>
  )
}
