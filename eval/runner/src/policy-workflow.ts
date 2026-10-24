import { join } from 'node:path'
import type { CaseView } from '@durable-jev/agent-core'
import {
  createLocalLogisticsAgents,
  dispatchCase,
  type LocalLogisticsAgents,
  loadCaseCatalog,
} from '@durable-jev/logistics'
import { ScriptedJudge } from '@durable-jev/model-providers'
import { scopeKey } from '@durable-jev/rule-engine'

export interface WorkflowScenario {
  baseline: string
  candidate: string
  activation: 'pinned' | 're-evaluate'
  extraCostCents: number
  approved: boolean
}

const caseId = 'LOG-005'
const now = () => '2026-10-30T08:00:00Z'
const manager = { id: 'carol', role: 'commercialManager' }

function stateOf(view: CaseView) {
  return {
    outcomes: view.outcomes
      .map((outcome) => ({
        key: `${outcome.ruleId}@${scopeKey(outcome.scope)}`,
        status: outcome.status,
        fingerprint: outcome.inputFingerprint,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    tasks: view.tasks
      .map((task) => ({ id: task.humanTaskId, rule: task.ruleId, status: task.status }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
}

export type WorkflowState = ReturnType<typeof stateOf>

interface WorkflowCompletion {
  priorTaskDecision?: string
  additionalApprovals: number
  ready: WorkflowState
  dispatch: Awaited<ReturnType<typeof dispatchCase>>
  retry: Awaited<ReturnType<typeof dispatchCase>>
  completedAt?: string
  dispatchEvents?: number
  reservations?: number
}

/** Experiment assembly only: policy choice is explicit, not a service-wide policy router. */
export class PolicyWorkflow {
  private readonly agents: LocalLogisticsAgents

  constructor(materials: string, directory: string) {
    const sample = loadCaseCatalog(join(materials, 'cases')).get(caseId)
    if (!sample) throw new Error(`missing ${caseId}`)
    this.agents = createLocalLogisticsAgents({
      materialsDirectory: materials,
      dataDirectory: directory,
      judgeFor: () => new ScriptedJudge(sample.scriptedJudgements),
      now,
    })
  }

  async prepare(scenario: WorkflowScenario): Promise<WorkflowState> {
    const sample = loadCaseCatalog(join(scenario.baseline, 'cases')).get(caseId)
    if (!sample) throw new Error(`missing ${caseId}`)
    await this.agents.orchestrator.submit({
      ...sample.shipment,
      quote: { ...sample.shipment.quote, extraCostCents: scenario.extraCostCents },
    })
    if (scenario.approved) await this.approveSurcharge()
    return this.state()
  }

  async transition(): Promise<WorkflowState> {
    await this.agents.orchestrator.propagate(caseId)
    return this.state()
  }

  async state(): Promise<WorkflowState> {
    return stateOf(await this.agents.view(caseId))
  }

  async finish(before: WorkflowState): Promise<WorkflowCompletion> {
    const prior = before.tasks.find((task) => task.rule === 'R35' && task.status === 'OPEN')
    const decision = prior
      ? await this.agents.orchestrator.decide(prior.id, { type: 'approve', actor: manager })
      : undefined
    const priorTaskDecision = decision && (decision.ok ? 'ACCEPTED' : decision.reason)
    const remaining = (await this.state()).tasks.filter(
      (task) => task.rule === 'R35' && task.status === 'OPEN',
    )
    for (const task of remaining) await this.approve(task.id)
    await this.completeLoading()
    const ready = await this.state()
    const dispatch = await this.dispatch()
    const retry = await this.dispatch()
    return {
      priorTaskDecision,
      additionalApprovals: remaining.length,
      ready,
      dispatch,
      retry,
      completedAt: this.agents.coordination.store.caseRecord(caseId)?.completedAt,
      dispatchEvents: this.agents.coordination.store.db
        .prepare<[], { count: number }>(
          "SELECT count(*) AS count FROM outbox WHERE event_name = 'case.dispatched'",
        )
        .get()?.count,
      reservations: this.agents.transport.store.db
        .prepare<[], { count: number }>('SELECT count(*) AS count FROM reservations')
        .get()?.count,
    }
  }

  close(): void {
    this.agents.close()
  }

  private async approveSurcharge() {
    const task = (await this.state()).tasks.find(
      (item) => item.rule === 'R35' && item.status === 'OPEN',
    )
    if (!task) throw new Error('expected an initial surcharge approval')
    await this.approve(task.id)
  }

  private async approve(id: string) {
    const result = await this.agents.orchestrator.decide(id, { type: 'approve', actor: manager })
    if (!result.ok) throw new Error(`approval refused: ${result.reason}`)
  }

  private async completeLoading() {
    const task = (await this.state()).tasks.find(
      (item) => item.rule === 'R39' && item.status === 'OPEN',
    )
    if (!task) throw new Error('expected a loading task after commercial clearance')
    const result = await this.agents.orchestrator.decide(task.id, {
      type: 'complete',
      actor: { id: 'wen', role: 'warehouseOperator' },
      fields: { loadScanId: 'SCAN-P1', sealNumber: 'SEAL-P1' },
      evidenceRefs: [],
    })
    if (!result.ok) throw new Error(`loading refused: ${result.reason}`)
  }

  private dispatch() {
    return dispatchCase(
      this.agents.orchestrator,
      this.agents.coordination.store,
      caseId,
      { id: 'dee', role: 'dispatcher' },
      now,
    )
  }
}
