import type { Shipment } from '@durable-jev/contracts'
import { ScriptedJudge } from '@durable-jev/model-providers'
import type { CaseFacts, RuleDefinition, RuleSet } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { CaseRuntime } from './case-runtime.js'
import { CaseStore } from './case-store.js'
import { type AgentClient, CaseOrchestrator, LocalAgentClient } from './orchestration.js'

function rule(
  ruleId: string,
  owner: RuleDefinition['owner'],
  overrides: Partial<RuleDefinition>,
): RuleDefinition {
  return {
    ruleId,
    version: '1',
    title: ruleId,
    owner,
    scope: 'order',
    dependsOn: [],
    evaluator: { kind: 'expression', ref: ruleId },
    unknownPolicy: 'block',
    inputPaths: [],
    parameters: [],
    invalidationTriggers: ['cargo'],
    ...overrides,
  }
}

const ruleSet: RuleSet = {
  ruleSetVersion: 'test',
  mixingMatrix: [],
  rules: [
    rule('R05', 'transport-planning', { expression: { passWhen: 'count(cargoItems) <= 2' } }),
    rule('R40', 'order-coordination', {
      dependsOn: ['R05'],
      evaluator: { kind: 'combinator', ref: 'R40' },
      combiner: { op: 'ref', ruleId: 'R05' },
    }),
  ],
}

const shipment = (caseRevision: number, items: number) =>
  ({
    caseId: 'LOG-T',
    caseRevision,
    entityVersions: { cargo: caseRevision, route: 1, carrier: 1, quote: 1 },
    cargoItems: Array.from({ length: items }, (_, index) => ({ cargoItemId: `ITEM-${index}` })),
  }) as unknown as Shipment

const factsOf = (current: Shipment): CaseFacts => ({
  entityVersions: current.entityVersions,
  root: { scope: { kind: 'order' }, facts: {} },
  context: { cargoItems: current.cargoItems.map(() => ({})) },
  collections: {
    cargoItem: current.cargoItems.map((item) => ({
      scope: { kind: 'cargoItem', cargoItemId: item.cargoItemId },
      facts: {},
    })),
  },
})

function agent(agentId: RuleDefinition['owner']) {
  const store = CaseStore.open(':memory:')
  const runtime = new CaseRuntime({
    agentId,
    store,
    rulePack: {
      policyVersion: 'test',
      ruleSet,
      parameters: {},
      policy: { title: '', preamble: [], sections: [] },
      clauses: new Map(),
    },
    codeEvaluators: new Map(),
    judgeFor: () => new ScriptedJudge([]),
    factsOf,
    now: () => '2026-11-01T08:00:00.000Z',
  })
  return { store, client: new LocalAgentClient(agentId, runtime, store) }
}

class SwitchableAgent implements AgentClient {
  online = true
  constructor(private readonly inner: AgentClient) {}
  get agentId() {
    return this.inner.agentId
  }
  private guard<T>(work: () => Promise<T>): Promise<T> {
    return this.online ? work() : Promise.reject(new Error(`${this.agentId} is offline`))
  }
  submit = (current: Shipment) => this.guard(() => this.inner.submit(current))
  evaluate = (caseId: string, foreign: Parameters<AgentClient['evaluate']>[1]) =>
    this.guard(() => this.inner.evaluate(caseId, foreign))
  state = (caseId: string) => this.guard(() => this.inner.state(caseId))
  decide = (taskId: string, action: Parameters<AgentClient['decide']>[1]) =>
    this.guard(() => this.inner.decide(taskId, action))
  openTasks = () => this.guard(() => this.inner.openTasks())
  events = () => this.guard(() => this.inner.events())
  acknowledgeEvents = (eventIds: readonly string[]) =>
    this.guard(() => this.inner.acknowledgeEvents(eventIds))
  reset = () => this.guard(() => this.inner.reset())
}

const releaseOf = async (orchestrator: CaseOrchestrator) =>
  (await orchestrator.state('LOG-T')).outcomes.find((outcome) => outcome.ruleId === 'R40')?.status

describe('CaseOrchestrator', () => {
  it('propagates results across agents until they settle', async () => {
    const coordination = agent('order-coordination')
    const transport = agent('transport-planning')
    const orchestrator = new CaseOrchestrator(
      [coordination.client, transport.client],
      ruleSet,
      (caseId) => coordination.store.caseRecord(caseId)?.shipment,
    )
    await orchestrator.submit(shipment(1, 2))
    expect(await releaseOf(orchestrator)).toBe('PASS')
  })

  it('never releases on results from an agent that missed the latest revision', async () => {
    const coordination = agent('order-coordination')
    const transport = new SwitchableAgent(agent('transport-planning').client)
    const orchestrator = new CaseOrchestrator(
      [coordination.client, transport],
      ruleSet,
      (caseId) => coordination.store.caseRecord(caseId)?.shipment,
    )
    await orchestrator.submit(shipment(1, 2))
    transport.online = false
    await orchestrator.submit(shipment(2, 3))
    expect(await releaseOf(orchestrator)).toBe('UNKNOWN')
    transport.online = true
    await orchestrator.propagate('LOG-T')
    expect(await releaseOf(orchestrator)).toBe('FAIL')
    expect((await transport.state('LOG-T')).caseRevision).toBe(2)
  })
})
