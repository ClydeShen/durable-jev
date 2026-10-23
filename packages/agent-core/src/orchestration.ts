import type { AgentId, HumanTask, Shipment } from '@durable-jev/contracts'
import type { Decision, HumanAction } from '@durable-jev/human-tasks'
import { type RuleOutcome, type RuleSet, scopeKey } from '@durable-jev/rule-engine'
import { clearData, markPublished, type OutboxEvent, unpublishedEvents } from '@durable-jev/store'
import type { CaseRuntime, CaseView } from './case-runtime.js'
import type { CaseStore } from './case-store.js'

export interface AgentCaseState {
  caseRevision?: number
  outcomes: RuleOutcome[]
  tasks: HumanTask[]
}

export interface AgentAvailability {
  agentId: AgentId
  available: boolean
}

export interface AgentClient {
  readonly agentId: AgentId
  submit(shipment: Shipment): Promise<AgentCaseState>
  evaluate(caseId: string, foreign: readonly RuleOutcome[]): Promise<AgentCaseState>
  state(caseId: string): Promise<AgentCaseState>
  decide(humanTaskId: string, action: HumanAction): Promise<Decision>
  openTasks(): Promise<HumanTask[]>
  events(): Promise<OutboxEvent[]>
  acknowledgeEvents(eventIds: readonly string[]): Promise<void>
  /** Forgets every case, or only the given one. */
  reset(caseId?: string): Promise<void>
}

const stateOf = (view: CaseView): AgentCaseState => ({
  caseRevision: view.record.shipment.caseRevision,
  outcomes: view.outcomes,
  tasks: view.tasks,
})

export class LocalAgentClient implements AgentClient {
  constructor(
    readonly agentId: AgentId,
    private readonly runtime: CaseRuntime,
    private readonly store: CaseStore,
  ) {}

  async submit(shipment: Shipment): Promise<AgentCaseState> {
    return stateOf(await this.runtime.submit(shipment))
  }

  async evaluate(caseId: string, foreign: readonly RuleOutcome[]): Promise<AgentCaseState> {
    return stateOf(await this.runtime.evaluate(caseId, foreign))
  }

  async state(caseId: string): Promise<AgentCaseState> {
    return this.store.caseRecord(caseId)
      ? stateOf(this.runtime.view(caseId))
      : { outcomes: [], tasks: [] }
  }

  decide(humanTaskId: string, action: HumanAction): Promise<Decision> {
    return this.runtime.decide(humanTaskId, action)
  }

  async openTasks(): Promise<HumanTask[]> {
    return this.store.openTasks()
  }

  async events(): Promise<OutboxEvent[]> {
    return unpublishedEvents(this.store.db)
  }

  async acknowledgeEvents(eventIds: readonly string[]): Promise<void> {
    markPublished(this.store.db, eventIds)
  }

  async reset(caseId?: string): Promise<void> {
    clearData(this.store.db, caseId)
  }
}

const roundLimit = 12

type Reachable = AgentCaseState | undefined

function signatureOf(states: readonly Reachable[]): string {
  return states
    .flatMap((state) => state?.outcomes ?? [])
    .map(
      (outcome) =>
        `${outcome.ruleId}@${scopeKey(outcome.scope)}=${outcome.status}/${outcome.inputFingerprint}`,
    )
    .sort()
    .join('\n')
}

function merged(states: readonly Reachable[]): AgentCaseState {
  return {
    outcomes: states.flatMap((state) => state?.outcomes ?? []),
    tasks: states.flatMap((state) => state?.tasks ?? []),
  }
}

const unreachable = () => undefined

export class CaseOrchestrator {
  private readonly owners: ReadonlyMap<string, AgentId>
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly agents: readonly AgentClient[],
    ruleSet: RuleSet,
    private readonly shipmentOf: (caseId: string) => Shipment | undefined,
  ) {
    this.owners = new Map(ruleSet.rules.map((rule) => [rule.ruleId, rule.owner]))
  }

  submit(shipment: Shipment): Promise<AgentCaseState> {
    return this.serialized(shipment.caseId, async () => {
      const states = await Promise.all(
        this.agents.map((agent) => agent.submit(shipment).catch(unreachable)),
      )
      return this.propagateFrom(shipment.caseId, states)
    })
  }

  propagate(caseId: string): Promise<AgentCaseState> {
    return this.serialized(caseId, async () =>
      this.propagateFrom(caseId, await this.synchronized(caseId)),
    )
  }

  async state(caseId: string): Promise<AgentCaseState> {
    return merged(
      await Promise.all(this.agents.map((agent) => agent.state(caseId).catch(unreachable))),
    )
  }

  async availability(): Promise<AgentAvailability[]> {
    return Promise.all(
      this.agents.map(async (agent) => ({
        agentId: agent.agentId,
        available: await agent.openTasks().then(
          () => true,
          () => false,
        ),
      })),
    )
  }

  async decide(humanTaskId: string, action: HumanAction): Promise<Decision> {
    const [caseId, ruleId] = humanTaskId.split('/')
    const owner = this.agents.find((agent) => agent.agentId === this.owners.get(ruleId ?? ''))
    if (!caseId || !owner) {
      return { ok: false, reason: 'NOT_FOUND', message: `task ${humanTaskId} does not exist` }
    }
    const decision = await owner.decide(humanTaskId, action).catch(
      (): Decision => ({
        ok: false,
        reason: 'AGENT_UNAVAILABLE',
        message: `${owner.agentId} is unavailable`,
      }),
    )
    if (decision.ok) await this.propagate(caseId)
    return decision
  }

  async openTasks(): Promise<HumanTask[]> {
    return (await Promise.all(this.agents.map((agent) => agent.openTasks().catch(() => [])))).flat()
  }

  async reset(caseId?: string): Promise<void> {
    await Promise.all(this.agents.map((agent) => agent.reset(caseId)))
  }

  private async synchronized(caseId: string): Promise<Reachable[]> {
    const shipment = this.shipmentOf(caseId)
    return Promise.all(
      this.agents.map(async (agent) => {
        const state = await agent.state(caseId).catch(unreachable)
        if (!state || !shipment || state.caseRevision === shipment.caseRevision) return state
        return agent.submit(shipment).catch(unreachable)
      }),
    )
  }

  private async propagateFrom(caseId: string, initial: Reachable[]): Promise<AgentCaseState> {
    let states = initial
    for (let round = 0; round < roundLimit; round++) {
      const next = await Promise.all(
        this.agents.map((agent, index) => {
          if (!states[index]) return undefined
          const foreign = states.flatMap((state, other) =>
            other === index ? [] : (state?.outcomes ?? []),
          )
          return agent.evaluate(caseId, foreign).catch(unreachable)
        }),
      )
      const settled = signatureOf(next) === signatureOf(states)
      states = next
      if (settled) break
    }
    return merged(states)
  }

  private serialized<T>(caseId: string, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(caseId) ?? Promise.resolve()).then(work, work)
    this.queues.set(
      caseId,
      next.catch(() => undefined),
    )
    return next
  }
}
