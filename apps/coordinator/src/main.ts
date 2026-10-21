import { resolve } from 'node:path'
import { A2aTaskLinks, a2aClientMigrations } from '@durable-jev/a2a-adapter'
import {
  judgeForModelMode,
  judgeMigrations,
  loadReferenceData,
  loadRuleConfiguration,
} from '@durable-jev/rule-evaluation'
import { startService } from '@durable-jev/service-kit'
import { openDatabase } from '@durable-jev/store'
import { initTracing, startServiceTelemetry } from '@durable-jev/telemetry'
import { reservationMigrations } from '@durable-jev/transport-reservations'
import { inProcessEvaluators, serviceEvaluators } from './branch.evaluator.js'
import { CoordinatorService } from './coordinator.service.js'
import { createCoordinatorApp } from './http/coordinator.app.js'
import { inProcessInvestigator } from './investigator.service.js'
import { coordinatorMigrations } from './persistence/coordinator.migrations.js'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const materialsDirectory = resolve(
  process.env.MATERIALS_DIR ?? resolve(repositoryRoot, 'eval/materials'),
)
const databasePath = resolve(
  process.env.COORDINATOR_DB ?? resolve(repositoryRoot, 'var/data/coordinator.sqlite'),
)
const port = Number(process.env.COORDINATOR_PORT ?? 4100)

const branchServiceUrls =
  process.env.CARGO_ASSURANCE_URL &&
  process.env.TRANSPORT_PLANNING_URL &&
  process.env.COMMERCIAL_CONTROL_URL
    ? {
        cargoAssurance: process.env.CARGO_ASSURANCE_URL,
        transportPlanning: process.env.TRANSPORT_PLANNING_URL,
        commercialControl: process.env.COMMERCIAL_CONTROL_URL,
      }
    : undefined

const database = openDatabase(databasePath, [
  ...coordinatorMigrations,
  ...judgeMigrations,
  ...a2aClientMigrations,
])
// BRANCH_PROTOCOL=a2a delegates to the branch services over A2A instead of native HTTP.
const protocol = process.env.BRANCH_PROTOCOL === 'a2a' ? 'a2a' : 'native'
const judgeFor = judgeForModelMode(process.env.MODEL_MODE, {
  apiKey: process.env.TYPESAFE_API_KEY,
  cacheDatabase: database,
})
// Events go to the outbox in the coordinator's own database; the relay delivers them to the
// collector in the background and the coordinator never waits on it.
const { telemetry, stop: stopTelemetry } = startServiceTelemetry({
  service: 'coordinator',
  database,
  collectorUrl: process.env.OBSERVABILITY_URL,
})
initTracing(telemetry)
const configuration = loadRuleConfiguration(materialsDirectory)
const referenceData = loadReferenceData(
  resolve(materialsDirectory, 'mock-data/reference-data.json'),
)
const coordinator = new CoordinatorService({
  database,
  telemetry,
  configuration,
  evaluators: branchServiceUrls
    ? serviceEvaluators(configuration, referenceData, branchServiceUrls, judgeFor, {
        protocol,
        links: new A2aTaskLinks(database),
        telemetry,
      })
    : inProcessEvaluators(
        configuration,
        referenceData,
        openDatabase(
          resolve(
            process.env.TRANSPORT_PLANNING_DB ??
              resolve(repositoryRoot, 'var/data/transport-planning.sqlite'),
          ),
          reservationMigrations,
        ),
        judgeFor,
        telemetry,
      ),
  investigator: inProcessInvestigator(configuration, referenceData),
})

coordinator.recordRestart()

await startService(createCoordinatorApp(coordinator, referenceData), {
  serviceName: 'coordinator',
  port,
  onClose: () => {
    stopTelemetry()
    database.close()
  },
})
