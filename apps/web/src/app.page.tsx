import type { HumanTask, PlanChange, ReferenceData, Role } from '@durable-jev/contracts'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type CaseSummary, type CaseView, type RuleCatalog } from './api.client.js'
import { AppNav } from './app-nav.component.js'
import { attentionFor } from './attention.model.js'
import { CaseAttention } from './case-attention.panel.js'
import { CaseList } from './case-list.panel.js'
import { ConsolePage } from './console/console.page.js'
import { DemoControls } from './demo-controls.panel.js'
import { FlowDiagram } from './flow/flow-diagram.view.js'
import { GuidePanel } from './guide/guide.panel.js'
import { scenarioFor } from './guide/scenarios.model.js'
import { HumanTaskPanel } from './human-task.panel.js'
import { Icon } from './icons.component.js'
import { InvestigationPanel } from './investigation.panel.js'
import {
  formatLocation,
  isConsoleHash,
  parseConsoleLocation,
  parseLocation,
} from './location.model.js'
import { PlanChangePanel } from './plan-change.panel.js'
import { ProofPage } from './proof/proof.page.js'
import { roleLabels, roles } from './roles.config.js'
import { RuleTree } from './rule-tree.view.js'
import { ShipmentSummary } from './shipment-summary.panel.js'
import { StatusBadge } from './status-badge.component.js'

const refreshIntervalMs = 2000

export function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  if (hash.startsWith('#/proof'))
    return (
      <div className="layout layout-console">
        <header className="topbar">
          <h1>Dispatch Workbench</h1>
          <AppNav current="proof" />
        </header>
        <ProofPage />
      </div>
    )
  if (!isConsoleHash(hash)) return <Workbench />
  return (
    <div className="layout layout-console">
      <header className="topbar">
        <h1>Dispatch Workbench</h1>
        <AppNav current="console" />
      </header>
      <ConsolePage
        location={parseConsoleLocation(hash)}
        navigate={(next) => {
          window.location.hash = next
        }}
      />
    </div>
  )
}

function Workbench() {
  const [actingRole, setActingRole] = useState<Role>('WAREHOUSE_OPERATOR')
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(
    () => parseLocation(window.location.hash).caseId,
  )
  const [selectedCase, setSelectedCase] = useState<CaseView>()
  const [catalog, setCatalog] = useState<RuleCatalog>()
  const [referenceData, setReferenceData] = useState<ReferenceData>()
  const [view, setView] = useState<'flow' | 'tree'>(() => parseLocation(window.location.hash).view)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string }>()
  // The action in flight. While it runs the action panels are disabled, so a slow service
  // never looks like a frozen page and nothing is sent twice by an impatient second click.
  const [busy, setBusy] = useState<string>()
  // Bumped on reset so a guide starts over even though the case ids are the same.
  const [resetCount, setResetCount] = useState(0)
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
    const next = formatLocation({ caseId: selectedCaseId, view })
    if (next && window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [selectedCaseId, view])

  useEffect(() => {
    // Back and forward, or a pasted link, change the hash without reloading the page.
    const onHashChange = () => {
      const next = parseLocation(window.location.hash)
      setSelectedCaseId(next.caseId)
      setView(next.view)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

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
  const ruleTitles = new Map<string, string>(
    (catalog?.rules ?? []).flatMap((rule) =>
      rule.title ? [[rule.ruleId as string, rule.title]] : [],
    ),
  )
  const scenario = selectedCase && scenarioFor(selectedCase.shipment.shipmentId)
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
        <AppNav current="workbench" />
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
                setResetCount((count) => count + 1)
                await api.resetDemo()
              },
              false,
            )
          }
        >
          <Icon name="reset" /> Reset demo
        </button>
      </header>

      {busy ? (
        <div className="message message-busy" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Working: {busy}
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
          key={resetCount}
          selectedCase={
            selectedCase
              ? {
                  caseId: selectedCase.caseId,
                  revision: selectedCase.shipment.caseRevision,
                  amountCents: selectedCase.shipment.quote.amountCents,
                }
              : undefined
          }
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
              {selectedCase.orderStatus !== 'DISPATCHED' &&
                selectedCase.orderStatus !== 'REJECTED' && (
                  <button
                    type="button"
                    onClick={() => run('Re-evaluate', () => api.reevaluate(selectedCase.caseId))}
                  >
                    <Icon name="reevaluate" /> Re-evaluate
                  </button>
                )}
            </div>
            {scenario && (
              <GuidePanel
                key={`${selectedCase.caseId}:${resetCount}`}
                scenario={scenario}
                state={selectedCase}
                actingRole={actingRole}
                setActingRole={setActingRole}
                ruleTitles={ruleTitles}
              />
            )}
            <CaseAttention
              attention={attentionFor({
                orderStatus: selectedCase.orderStatus,
                humanTasks: selectedCase.humanTasks,
                checks: selectedCase.checks,
                rules: catalog?.rules ?? [],
                actingRole,
              })}
            />
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
                <p className="muted">Loading rules</p>
              ) : view === 'flow' ? (
                <FlowDiagram
                  rules={catalog.rules}
                  checks={selectedCase.checks}
                  humanTasks={selectedCase.humanTasks}
                  correlationId={selectedCase.correlationId}
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
                    ruleTitles={ruleTitles}
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
                </div>
                <div>
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
          <p className="muted">Select a case to see its checks, tasks and plan.</p>
        )}
      </main>
    </div>
  )
}
