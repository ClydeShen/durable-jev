import type { CaseRuntime, CaseStore, RulePack } from '@durable-jev/agent-core'
import {
  DurableInvestigator,
  type InvestigatorModel,
  type RunBudget,
  type RunOutcome,
} from '@durable-jev/agent-harness'
import type { Role } from '@durable-jev/contracts'
import type { ReferenceData } from '../reference-data.js'
import {
  type Incident,
  type Investigation,
  InvestigationStore,
  type RerouteProposal,
} from './investigation-store.js'
import { reroutePatch } from './reroute-plan.js'
import { rerouteTools } from './reroute-tools.js'

const instructions = [
  'You are the investigation helper of the transport planning agent in a logistics company.',
  'A leg of a shipment lost its carrier. Find a replacement from the spare capacity offers.',
  'Read the case, list the offers for the incident leg, and pre-check candidates with check_plan.',
  'Only propose an offer whose checks all pass; prefer the cheapest such offer.',
  'If no offer passes, escalate to the planner. Explain your choice in the rationale,',
  'written for the planner in Simplified Chinese (简体中文, never Traditional characters),',
  'naming the rules each rejected offer failed.',
  'Call submit_investigation_result exactly once, then give a one-sentence summary.',
  'You cannot approve, apply or dispatch anything; a human planner decides on your proposal.',
].join('\n')

const task = 'Investigate the incident and submit a reroute proposal or an escalation.'

export interface RerouteDeskOptions {
  cases: CaseStore
  runtime: CaseRuntime
  rulePack: RulePack
  reference: ReferenceData
  /** Pi Durable storage file, or `memory`. */
  storage: string
  model: InvestigatorModel
  budget?: Partial<RunBudget>
  now(): string
}

export type ProposalDecision = {
  type: 'confirm' | 'reject'
  actor: { id: string; role: Role }
}

export type DecisionResult =
  | { ok: true; investigation: Investigation; patch?: Record<string, unknown> }
  | {
      ok: false
      reason: 'NOT_FOUND' | 'ROLE_NOT_ALLOWED' | 'NOT_PROPOSED' | 'STALE'
      message: string
    }

function escalationReason(outcome: RunOutcome): string {
  if (outcome.status === 'timedOut') return 'the helper ran out of time'
  if (outcome.status === 'unanswered') return `the helper stopped: ${outcome.reason}`
  return 'the helper finished without submitting a result'
}

/**
 * The transport planning agent's incident desk: starts the investigation helper for an incident,
 * keeps its result, and turns a planner-confirmed proposal into a case revision.
 */
export class RerouteDesk {
  private readonly runs = new Map<string, Promise<Investigation>>()

  private constructor(
    private readonly options: RerouteDeskOptions,
    private readonly investigations: InvestigationStore,
    private readonly investigator: DurableInvestigator<Investigation>,
  ) {}

  static async open(options: RerouteDeskOptions): Promise<RerouteDesk> {
    const investigations = new InvestigationStore(options.cases.db)
    const record = (investigation: Investigation, eventName: string, payload = {}) =>
      options.cases.record({
        caseId: investigation.caseId,
        eventName,
        payload: { investigationId: investigation.investigationId, ...payload },
      })
    const settle = (investigation: Investigation) => {
      investigations.put(investigation)
      record(investigation, `investigation.${investigation.status.toLowerCase()}`, {
        proposal: investigation.proposal,
        escalation: investigation.escalation,
      })
    }
    const investigator = await DurableInvestigator.open<Investigation>({
      storage: options.storage,
      instructions,
      tools: rerouteTools({ ...options, investigations, settle }),
      scopeOf: (conversationId) => investigations.byConversation(conversationId),
      model: options.model,
      budget: options.budget,
      onToolCall: ({ scope, tool, args, blocked }) =>
        record(scope, 'investigation.tool_called', { tool, args, blocked }),
    })
    return new RerouteDesk(options, investigations, investigator)
  }

  /** Starts the helper for an incident; one investigation per case revision. */
  async report(caseId: string, incident: Incident): Promise<Investigation> {
    const shipment = this.options.cases.caseRecord(caseId)?.shipment
    if (!shipment) throw new Error(`case ${caseId} does not exist`)
    const investigationId = `${caseId}/INV-r${shipment.caseRevision}`
    const existing = this.investigations.get(investigationId)
    if (existing) return existing
    const investigation: Investigation = {
      investigationId,
      caseId,
      caseRevision: shipment.caseRevision,
      conversationId: await this.investigator.begin(),
      incident,
      status: 'RUNNING',
      startedAt: this.options.now(),
    }
    this.investigations.put(investigation)
    this.options.cases.record({
      caseId,
      eventName: 'investigation.started',
      payload: { investigationId, incident },
    })
    this.start(investigation)
    return investigation
  }

  /** Continues investigations a crash interrupted, from their last checkpoint. */
  resumeInterrupted() {
    for (const investigation of this.investigations.running()) this.start(investigation)
  }

  /** Resolves when the helper has finished this investigation. */
  settled(investigationId: string): Promise<Investigation | undefined> {
    return (
      this.runs.get(investigationId) ?? Promise.resolve(this.investigations.get(investigationId))
    )
  }

  ofCase(caseId: string): Investigation[] {
    return this.investigations.ofCase(caseId)
  }

  decide(investigationId: string, decision: ProposalDecision): DecisionResult {
    const investigation = this.investigations.get(investigationId)
    if (!investigation) {
      return { ok: false, reason: 'NOT_FOUND', message: `no investigation ${investigationId}` }
    }
    if (decision.actor.role !== 'transportPlanner') {
      return {
        ok: false,
        reason: 'ROLE_NOT_ALLOWED',
        message: 'only a transport planner can decide on a reroute proposal',
      }
    }
    if (investigation.status !== 'PROPOSED' || !investigation.proposal) {
      return {
        ok: false,
        reason: 'NOT_PROPOSED',
        message: `investigation is ${investigation.status}`,
      }
    }
    const shipment = this.options.cases.caseRecord(investigation.caseId)?.shipment
    if (shipment?.caseRevision !== investigation.caseRevision) {
      this.finish(investigation, 'STALE', decision)
      return {
        ok: false,
        reason: 'STALE',
        message: `the case moved on from revision ${investigation.caseRevision}`,
      }
    }
    if (decision.type === 'reject') {
      return { ok: true, investigation: this.finish(investigation, 'REJECTED', decision) }
    }
    return {
      ok: true,
      investigation: this.finish(investigation, 'CONFIRMED', decision),
      patch: reroutePatch(
        shipment,
        investigation.proposal.legId,
        this.offerOf(investigation.proposal),
      ),
    }
  }

  close(): Promise<void> {
    return this.investigator.close()
  }

  private offerOf(proposal: RerouteProposal) {
    const offer = this.options.reference.capacityOffers.get(proposal.offerId)
    if (!offer) throw new Error(`offer ${proposal.offerId} is no longer listed`)
    return offer
  }

  private finish(
    investigation: Investigation,
    status: 'CONFIRMED' | 'REJECTED' | 'STALE',
    decision: ProposalDecision,
  ): Investigation {
    const decided: Investigation = {
      ...investigation,
      status,
      decidedBy: { ...decision.actor, at: this.options.now() },
    }
    this.investigations.put(decided)
    this.options.cases.record({
      caseId: investigation.caseId,
      eventName: `investigation.${status.toLowerCase()}`,
      payload: { investigationId: investigation.investigationId, decidedBy: decided.decidedBy },
    })
    return decided
  }

  private start(investigation: Investigation) {
    const { investigationId, conversationId, caseId, incident } = investigation
    const run = this.investigator
      .run(conversationId, investigationId, task, { caseId, incident })
      .then((outcome) => {
        const current = this.investigations.get(investigationId) ?? investigation
        if (current.status !== 'RUNNING') return current
        const escalation = escalationReason(outcome)
        const escalated: Investigation = { ...current, status: 'ESCALATED', escalation }
        this.investigations.put(escalated)
        this.options.cases.record({
          caseId,
          eventName: 'investigation.escalated',
          payload: { investigationId, escalation },
        })
        return escalated
      })
      .finally(() => this.runs.delete(investigationId))
    this.runs.set(investigationId, run)
  }
}
