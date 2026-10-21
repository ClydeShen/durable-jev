import { join } from 'node:path'
import {
  CaseOrchestrator,
  CaseRuntime,
  CaseStore,
  LocalAgentClient,
  loadRulePack,
  type RulePack,
} from '@durable-jev/agent-core'
import type { AgentId, Shipment } from '@durable-jev/contracts'
import type { SemanticJudge } from '@durable-jev/model-providers'
import type { LeafEvaluator } from '@durable-jev/rule-engine'
import type { Migration } from '@durable-jev/store'
import { buildCaseFacts } from './case-facts.js'
import { loadReferenceData, type ReferenceData } from './reference-data.js'
import { investigationMigrations } from './reroute/investigation-store.js'
import { reservationMigrations, reserveTransport } from './transport-reservation.js'

export function agentMigrations(agentId: AgentId): readonly Migration[] {
  return agentId === 'transport-planning'
    ? [...reservationMigrations, ...investigationMigrations]
    : []
}

const codeEvaluatorOwners: Record<string, AgentId> = { R29: 'transport-planning' }

function codeEvaluatorsFor(agentId: AgentId, store: CaseStore): Map<string, LeafEvaluator> {
  return agentId === 'transport-planning'
    ? new Map([['R29', reserveTransport(store.db)]])
    : new Map()
}

export interface LogisticsRuntimeOptions {
  agentId: AgentId
  materialsDirectory: string
  store: CaseStore
  judgeFor(shipment: Shipment): SemanticJudge
  now(): string
}

export interface LogisticsRuntime {
  runtime: CaseRuntime
  rulePack: RulePack
  reference: ReferenceData
}

export function loadLogisticsRulePack(materialsDirectory: string): RulePack {
  return loadRulePack(materialsDirectory, new Set(Object.keys(codeEvaluatorOwners)))
}

export function createLogisticsRuntime(options: LogisticsRuntimeOptions): LogisticsRuntime {
  const reference = loadReferenceData(join(options.materialsDirectory, 'mock-data'))
  const rulePack = loadLogisticsRulePack(options.materialsDirectory)
  const runtime = new CaseRuntime({
    agentId: options.agentId,
    store: options.store,
    rulePack,
    codeEvaluators: codeEvaluatorsFor(options.agentId, options.store),
    judgeFor: options.judgeFor,
    factsOf: (shipment) => buildCaseFacts(shipment, reference),
    now: options.now,
  })
  return { runtime, rulePack, reference }
}

export interface LocalLogisticsAgents {
  orchestrator: CaseOrchestrator
  coordination: { runtime: CaseRuntime; store: CaseStore }
  transport: { runtime: CaseRuntime; store: CaseStore; reference: ReferenceData }
  rulePack: RulePack
}

export interface LocalLogisticsOptions extends Omit<LogisticsRuntimeOptions, 'agentId' | 'store'> {
  /** Keeps each agent's store in this directory so it survives a restart; in memory otherwise. */
  dataDirectory?: string
}

export function createLocalLogisticsAgents(options: LocalLogisticsOptions): LocalLogisticsAgents {
  const owners = loadLogisticsRulePack(options.materialsDirectory).ruleSet.rules.map(
    (rule) => rule.owner,
  )
  const agents = [...new Set(owners)].map((agentId) => {
    const store = CaseStore.open(
      options.dataDirectory ? join(options.dataDirectory, `${agentId}.sqlite`) : ':memory:',
      agentMigrations(agentId),
    )
    const { runtime, rulePack, reference } = createLogisticsRuntime({ ...options, agentId, store })
    return {
      agentId,
      store,
      runtime,
      rulePack,
      reference,
      client: new LocalAgentClient(agentId, runtime, store),
    }
  })
  const coordination = agents.find((agent) => agent.agentId === 'order-coordination')
  const transport = agents.find((agent) => agent.agentId === 'transport-planning')
  if (!coordination || !transport) throw new Error('missing logistics agents')
  return {
    orchestrator: new CaseOrchestrator(
      agents.map((agent) => agent.client),
      coordination.rulePack.ruleSet,
      (caseId) => coordination.store.caseRecord(caseId)?.shipment,
    ),
    coordination: { runtime: coordination.runtime, store: coordination.store },
    transport: {
      runtime: transport.runtime,
      store: transport.store,
      reference: transport.reference,
    },
    rulePack: coordination.rulePack,
  }
}
