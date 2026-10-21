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
import { loadReferenceData } from './reference-data.js'
import { reservationMigrations, reserveTransport } from './transport-reservation.js'

const logisticsAgents = [
  'order-coordination',
  'cargo-assurance',
  'transport-planning',
  'commercial-control',
] as const satisfies readonly AgentId[]

export function agentMigrations(agentId: AgentId): readonly Migration[] {
  return agentId === 'transport-planning' ? reservationMigrations : []
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
}

export function createLogisticsRuntime(options: LogisticsRuntimeOptions): LogisticsRuntime {
  const reference = loadReferenceData(join(options.materialsDirectory, 'mock-data'))
  const rulePack = loadRulePack(
    options.materialsDirectory,
    new Set(Object.keys(codeEvaluatorOwners)),
  )
  const runtime = new CaseRuntime({
    agentId: options.agentId,
    store: options.store,
    rulePack,
    codeEvaluators: codeEvaluatorsFor(options.agentId, options.store),
    judgeFor: options.judgeFor,
    factsOf: (shipment) => buildCaseFacts(shipment, reference),
    now: options.now,
  })
  return { runtime, rulePack }
}

export interface LocalLogisticsAgents {
  orchestrator: CaseOrchestrator
  coordination: { runtime: CaseRuntime; store: CaseStore }
  rulePack: RulePack
}

export function createLocalLogisticsAgents(
  options: Omit<LogisticsRuntimeOptions, 'agentId' | 'store'>,
): LocalLogisticsAgents {
  const agents = logisticsAgents.map((agentId) => {
    const store = CaseStore.open(':memory:', agentMigrations(agentId))
    const { runtime, rulePack } = createLogisticsRuntime({ ...options, agentId, store })
    return {
      agentId,
      store,
      runtime,
      rulePack,
      client: new LocalAgentClient(agentId, runtime, store),
    }
  })
  const [coordination] = agents
  if (!coordination) throw new Error('no logistics agents')
  return {
    orchestrator: new CaseOrchestrator(
      agents.map((agent) => agent.client),
      coordination.rulePack.ruleSet,
    ),
    coordination: { runtime: coordination.runtime, store: coordination.store },
    rulePack: coordination.rulePack,
  }
}
