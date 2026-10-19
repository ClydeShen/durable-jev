import { resolve } from 'node:path'
import { openDatabase } from '@durable-jev/store'
import { loadReferenceData, loadRuleConfiguration } from './configuration.js'
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

const coordinator = new CoordinatorService({
  database: openDatabase(databasePath, coordinatorMigrations),
  configuration: loadRuleConfiguration({
    rulesPath: resolve(materialsDirectory, 'rules.json'),
    policyPath: resolve(materialsDirectory, 'mock-policy-parameters.json'),
  }),
  referenceData: loadReferenceData(resolve(materialsDirectory, 'mock-data/reference-data.json')),
})

createCoordinatorApp(coordinator).listen(port, () => {
  console.log(`coordinator listening on http://localhost:${port} (db: ${databasePath})`)
})
