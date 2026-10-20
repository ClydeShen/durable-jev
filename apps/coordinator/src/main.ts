import { resolve } from 'node:path'
import { loadReferenceData, loadRuleConfiguration } from '@durable-jev/rule-evaluation'
import { startService } from '@durable-jev/service-kit'
import { openDatabase } from '@durable-jev/store'
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

const database = openDatabase(databasePath, coordinatorMigrations)
const coordinator = new CoordinatorService({
  database,
  configuration: loadRuleConfiguration({
    rulesPath: resolve(materialsDirectory, 'rules.json'),
    policyPath: resolve(materialsDirectory, 'mock-policy-parameters.json'),
    mixingMatrixPath: resolve(materialsDirectory, 'decision-tables/mixing-matrix.json'),
  }),
  referenceData: loadReferenceData(resolve(materialsDirectory, 'mock-data/reference-data.json')),
})

await startService(createCoordinatorApp(coordinator), {
  serviceName: 'coordinator',
  port,
  onClose: () => database.close(),
})
