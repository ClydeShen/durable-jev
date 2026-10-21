import { join } from 'node:path'
import { CaseRuntime, type CaseStore, loadRulePack, type RulePack } from '@durable-jev/agent-core'
import type { Shipment } from '@durable-jev/contracts'
import type { SemanticJudge } from '@durable-jev/model-providers'
import { buildCaseFacts } from './case-facts.js'
import { loadReferenceData } from './reference-data.js'
import { reserveTransport } from './transport-reservation.js'

export interface LogisticsRuntimeOptions {
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
  const codeEvaluators = new Map([['R29', reserveTransport(options.store.db)]])
  const rulePack = loadRulePack(options.materialsDirectory, new Set(codeEvaluators.keys()))
  const runtime = new CaseRuntime({
    store: options.store,
    rulePack,
    codeEvaluators,
    judgeFor: options.judgeFor,
    factsOf: (shipment) => buildCaseFacts(shipment, reference),
    now: options.now,
  })
  return { runtime, rulePack }
}
