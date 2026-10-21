import type { AgentId, HumanTask, Shipment } from '@durable-jev/contracts'
import type { Decision, HumanAction } from '@durable-jev/human-tasks'
import { type RuleOutcome, type RuleSet, scopeKey } from '@durable-jev/rule-engine'
import { clearData } from '@durable-jev/store'
import type { CaseRuntime } from './case-runtime.js'
import type { CaseStore } from './case-store.js'

export interface AgentCaseState {
  outcomes: RuleOutcome[]
  tasks: HumanTask[]
}

export interface AgentClient {
  readonly agentId: AgentId
  submit(shipment: Shipment): Promise<AgentCaseState>
  evaluate(caseId: string, foreign: readonly RuleOutcome[]): Promise<AgentCaseState>
  state(caseId: string): Promise<AgentCaseState>
  decide(humanTaskId: string, action: HumanAction): Promise<Decision>
  openTasks(): Promise<HumanTask[]>
  reset(): Promise<void>
}

export class LocalAgentClient implements AgentClient {
  constructor(
    readonly agentId: AgentId,
    private readonly runtime: CaseRuntime,
    private readonly store: CaseStore,
  ) {}

  async submit(shipment: Shipment) {
    const { outcomes, tasks } = await this.runtime.submit(shipment)
    return { outcomes, tasks }
  }

  async evaluate(caseId: string, foreign: readonly RuleOutcome[]) {
    const { outcomes, tasks } = await this.runtime.evaluate(caseId, foreign)
    return { outcomes, tasks }
  }

  async state(caseId: string) {
    const { outcomes, tasks } = this.runtime.view(caseId)
    return { outcomes, tasks }
  }

  decide(humanTaskId: string, action: HumanAction) {
    return this.runtime.decide(humanTaskId, action)
  }

  async openTasks() {
    return this.store.openTasks()
  }

  async reset() {
    clearData(this.store.db)
  }
}

const roundLimit = 12

function signatureOf(states: readonly AgentCaseState[]): string {
  return states
    .flatMap((state) => state.outcomes)
    .map(
      (outcome) =>
        `${outcome.ruleId}@${scopeKey(outcome.scope)}=${outcome.status}/${outcome.inputFingerprint}`,
    )
    .sort()
    .join('\n')
}

function merged(states: readonly AgentCaseState[]): AgentCaseState {
  return {
    outcomes: states.flatMap((state) => state.outcomes),
    tasks: states.flatMap((state) => state.tasks),
  }
}

export class CaseOrchestrator {
  private readonly owners: ReadonlyMap<string, AgentId>
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly agents: readonly AgentClient[],
    ruleSet: RuleSet,
  ) {
    this.owners = new Map(ruleSet.rules.map((rule) => [rule.ruleId, rule.owner]))
  }

  submit(shipment: Shipment): Promise<AgentCaseState> {
    return this.serialized(shipment.caseId, async () => {
      const states = await Promise.all(this.agents.map((agent) => agent.submit(shipment)))
      return this.propagateFrom(shipment.caseId, states)
    })
  }

  propagate(caseId: string): Promise<AgentCaseState> {
    return this.serialized(caseId, async () =>
      this.propagateFrom(
        caseId,
        await Promise.all(this.agents.map((agent) => agent.state(caseId))),
      ),
    )
  }

  async state(caseId: string): Promise<AgentCaseState> {
    return merged(await Promise.all(this.agents.map((agent) => agent.state(caseId))))
  }

  async decide(humanTaskId: string, action: HumanAction): Promise<Decision> {
    const [caseId, ruleId] = humanTaskId.split('/')
    const owner = this.agents.find((agent) => agent.agentId === this.owners.get(ruleId ?? ''))
    if (!caseId || !owner)
      return { ok: false, reason: 'NOT_FOUND', message: `task ${humanTaskId} does not exist` }
    const decision = await owner.decide(humanTaskId, action)
    if (decision.ok) await this.propagate(caseId)
    return decision
  }

  async openTasks(): Promise<HumanTask[]> {
    return (await Promise.all(this.agents.map((agent) => agent.openTasks()))).flat()
  }

  async reset() {
    await Promise.all(this.agents.map((agent) => agent.reset()))
  }

  private async propagateFrom(caseId: string, initial: AgentCaseState[]): Promise<AgentCaseState> {
    let states = initial
    for (let round = 0; round < roundLimit; round++) {
      const next = await Promise.all(
        this.agents.map((agent, index) =>
          agent.evaluate(
            caseId,
            states.flatMap((state, other) => (other === index ? [] : state.outcomes)),
          ),
        ),
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
