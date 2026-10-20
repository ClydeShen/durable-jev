import { resolve } from 'node:path'
import { loadReferenceData, loadRuleConfiguration } from '@durable-jev/rule-evaluation'
import { startService } from '@durable-jev/service-kit'
import { openDatabase } from '@durable-jev/store'
import { reservationMigrations } from '@durable-jev/transport-reservations'
import { inProcessEvaluators, serviceEvaluators } from './branch-evaluators.js'
import { CoordinatorService } from './coordinator-service.js'
import { createCoordinatorApp } from './http/coordinator-app.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

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

const database = openDatabase(databasePath, coordinatorMigrations)
const configuration = loadRuleConfiguration({
  rulesPath: resolve(materialsDirectory, 'rules.json'),
  policyPath: resolve(materialsDirectory, 'mock-policy-parameters.json'),
  mixingMatrixPath: resolve(materialsDirectory, 'decision-tables/mixing-matrix.json'),
})
const referenceData = loadReferenceData(
  resolve(materialsDirectory, 'mock-data/reference-data.json'),
)
const coordinator = new CoordinatorService({
  database,
  configuration,
  evaluators: branchServiceUrls
    ? serviceEvaluators(configuration, referenceData, branchServiceUrls)
    : inProcessEvaluators(
        configuration,
        referenceData,
        openDatabase(
          resolve(repositoryRoot, 'var/data/transport-planning.sqlite'),
          reservationMigrations,
        ),
      ),
})

await startService(createCoordinatorApp(coordinator, referenceData), {
  serviceName: 'coordinator',
  port,
  onClose: () => database.close(),
})
