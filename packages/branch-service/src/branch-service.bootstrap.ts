import { resolve } from 'node:path'
import type { BranchEvaluationRequest, RuleBranch } from '@durable-jev/contracts'
import {
  judgeForModelMode,
  judgeMigrations,
  loadReferenceData,
  loadRuleConfiguration,
} from '@durable-jev/rule-evaluation'
import { startService } from '@durable-jev/service-kit'
import { type Migration, openDatabase, type StoreDatabase } from '@durable-jev/store'
import { initTracing, startServiceTelemetry } from '@durable-jev/telemetry'
import { branchServiceMigrations, createBranchServiceApp } from './branch-service.app.js'

export async function startBranchService(options: {
  serviceName: string
  branches: readonly RuleBranch[]
  defaultPort: number
  extraMigrations?: readonly Migration[]
  ensurePlanReservation?: (database: StoreDatabase, request: BranchEvaluationRequest) => boolean
}) {
  const repositoryRoot = resolve(import.meta.dirname, '../../..')
  const materialsDirectory = resolve(
    process.env.MATERIALS_DIR ?? resolve(repositoryRoot, 'eval/materials'),
  )
  const databasePath = resolve(
    process.env.SERVICE_DB ?? resolve(repositoryRoot, `var/data/${options.serviceName}.sqlite`),
  )
  const database = openDatabase(databasePath, [
    ...branchServiceMigrations,
    ...judgeMigrations,
    ...(options.extraMigrations ?? []),
  ])
  const { telemetry, stop: stopTelemetry } = startServiceTelemetry({
    service: options.serviceName,
    database,
    collectorUrl: process.env.OBSERVABILITY_URL,
  })
  initTracing(telemetry)
  const { ensurePlanReservation } = options
  const port = Number(process.env.SERVICE_PORT ?? options.defaultPort)
  const app = createBranchServiceApp({
    serviceName: options.serviceName,
    branches: options.branches,
    configuration: loadRuleConfiguration(materialsDirectory),
    referenceData: loadReferenceData(resolve(materialsDirectory, 'mock-data/reference-data.json')),
    database,
    telemetry,
    publicUrl: () => process.env.SERVICE_PUBLIC_URL ?? `http://localhost:${port}`,
    demoFaults: process.env.DEMO_FAULTS === 'on',
    judgeFor: judgeForModelMode(process.env.MODEL_MODE, {
      apiKey: process.env.TYPESAFE_API_KEY,
      cacheDatabase: database,
    }),
    ...(ensurePlanReservation
      ? { ensurePlanReservation: (request) => ensurePlanReservation(database, request) }
      : {}),
  })
  return startService(app, {
    serviceName: options.serviceName,
    port,
    onClose: () => {
      stopTelemetry()
      database.close()
    },
  })
}
