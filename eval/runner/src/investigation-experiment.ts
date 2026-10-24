import { join } from 'node:path'
import { canonicalJson } from '@durable-jev/contracts'
import {
  applyRevision,
  type Investigation,
  type RerouteDesk,
  scriptedRerouter,
} from '@durable-jev/logistics'
import { actor, FaultLab } from './faults/lab.js'

export interface InvestigationScenario {
  offers: 'original' | 'first-valid' | 'no-valid' | 'no-offers'
  strategy: 'first-valid' | 'check-all'
  storage: 'memory' | 'durable'
}

/** Both controllers are authored algorithms. This control inspects every offer before choosing. */
const exhaustiveRerouter: typeof scriptedRerouter = (results) => {
  const next = scriptedRerouter(results)
  if (!('call' in next) || next.call !== 'submit_investigation_result') return next
  const offers = results.find((item) => item.tool === 'search_capacity_offers')?.result as
    | { offerId: string }[]
    | undefined
  const checked = new Set(
    results
      .filter((item) => item.tool === 'check_plan')
      .map((item) => (item.result as { offerId: string }).offerId),
  )
  const untested = offers?.find((offer) => !checked.has(offer.offerId))
  return untested ? { call: 'check_plan', args: { offerId: untested.offerId } } : next
}

interface ToolAttempt {
  tool: string
  args: unknown
  blocked?: string
}

export interface InvestigationEvidence {
  status?: Investigation['status']
  offerId?: string
  checks?: { ruleId: string; status: string }[]
  escalation?: string
  resumeError?: string
  attempts: ToolAttempt[]
  completedTools: { tool: string; result: unknown }[]
  unchangedBeforeConfirmation: boolean
  proposalEvents: number
  confirmationEvents: number
  wrongRole?: string
  confirmation?: string
  repeatedConfirmation?: string
  caseRevision: number
  dispatched: boolean
}

export class InvestigationExperiment {
  readonly lab: FaultLab
  private desk?: RerouteDesk
  private completedTools: InvestigationEvidence['completedTools'] = []

  constructor(
    private readonly directory: string,
    private readonly scenario: InvestigationScenario,
  ) {
    this.lab = new FaultLab('LOG-004', { dataDirectory: directory })
  }

  async open(): Promise<void> {
    const reference = this.lab.agents.transport.reference
    const offers = [...reference.capacityOffers.values()].flatMap((offer) => {
      if (this.scenario.offers === 'no-offers') return []
      if (offer.offerId !== 'OFF-FROST-0630') return [offer]
      if (this.scenario.offers === 'no-valid') return []
      return [
        {
          ...offer,
          priceCents: this.scenario.offers === 'first-valid' ? 350_000 : offer.priceCents,
        },
      ]
    })
    this.desk = await this.lab.openDesk({
      reference: {
        ...reference,
        capacityOffers: new Map(offers.map((offer) => [offer.offerId, offer])),
      },
      storage: this.scenario.storage === 'memory' ? 'memory' : join(this.directory, 'pi.sqlite'),
      model: {
        kind: 'scripted',
        next: (results) => {
          this.completedTools = [...results]
          return this.scenario.strategy === 'first-valid'
            ? scriptedRerouter(results)
            : exhaustiveRerouter(results)
        },
      },
    })
  }

  /** Exit before executing the first check/submit, after reads have checkpointed. */
  interruptAfterReads(onInterrupt: () => never): void {
    const store = this.lab.agents.transport.store
    const record = store.record.bind(store)
    store.record = (event) => {
      record(event)
      if (event.eventName !== 'investigation.tool_called') return
      const { tool } = event.payload as ToolAttempt
      if (tool === 'check_plan' || tool === 'submit_investigation_result') onInterrupt()
    }
  }

  async investigate(resume: boolean): Promise<string | undefined> {
    const desk = this.openDesk
    if (resume) desk.resumeInterrupted()
    else await desk.report(this.lab.caseId, { type: 'carrierCancelled', legId: 'LEG-1' })
    const investigation = desk.ofCase(this.lab.caseId)[0]
    if (!investigation) throw new Error('missing investigation')
    try {
      await desk.settled(investigation.investigationId)
      return undefined
    } catch (error) {
      return String(error)
    }
  }

  async evidence(original: string, resumeError?: string): Promise<InvestigationEvidence> {
    const investigation = this.openDesk.ofCase(this.lab.caseId)[0]
    const evidence: InvestigationEvidence = {
      status: investigation?.status,
      offerId: investigation?.proposal?.offerId,
      checks: investigation?.proposal?.checks.map(({ ruleId, status }) => ({ ruleId, status })),
      escalation: investigation?.escalation,
      resumeError,
      attempts: this.events('investigation.tool_called') as ToolAttempt[],
      completedTools: this.completedTools,
      unchangedBeforeConfirmation: canonicalJson(this.lab.shipment) === original,
      proposalEvents: this.events('investigation.proposed').length,
      confirmationEvents: 0,
      caseRevision: this.lab.shipment.caseRevision,
      dispatched: Boolean((await this.lab.view()).record.completedAt),
    }
    if (investigation?.status === 'PROPOSED') {
      const id = investigation.investigationId
      const wrong = this.openDesk.decide(id, {
        type: 'confirm',
        actor: actor('wen', 'warehouseOperator'),
      })
      evidence.wrongRole = wrong.ok ? 'ACCEPTED' : wrong.reason
      const planner = { type: 'confirm', actor: actor('pat', 'transportPlanner') } as const
      const decision = this.openDesk.decide(id, planner)
      evidence.confirmation = decision.ok ? 'ACCEPTED' : decision.reason
      if (decision.ok && decision.patch) {
        await this.lab.submit(applyRevision(this.lab.shipment, decision.patch))
      }
      const repeat = this.openDesk.decide(id, planner)
      evidence.repeatedConfirmation = repeat.ok ? 'ACCEPTED' : repeat.reason
      evidence.caseRevision = this.lab.shipment.caseRevision
      evidence.confirmationEvents = this.events('investigation.confirmed').length
      evidence.dispatched = Boolean((await this.lab.view()).record.completedAt)
    }
    return evidence
  }

  async close(): Promise<void> {
    await this.desk?.close()
    this.lab.agents.close()
  }

  private get openDesk(): RerouteDesk {
    if (!this.desk) throw new Error('investigation desk is not open')
    return this.desk
  }

  private events(name: string): unknown[] {
    return this.lab.agents.transport.store.db
      .prepare<[string], { payload_json: string }>(
        'SELECT payload_json FROM outbox WHERE event_name = ? ORDER BY sequence',
      )
      .all(name)
      .map((row) => JSON.parse(row.payload_json))
  }
}
