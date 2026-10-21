import { resolve } from 'node:path'
import { startService } from '@durable-jev/service-kit'
import { openDatabase } from '@durable-jev/store'
import { createObservabilityApp } from './observability.app.js'
import { ObservationStore, observationMigrations } from './observation.repository.js'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const databasePath = resolve(
  process.env.OBSERVABILITY_DB ?? resolve(repositoryRoot, 'var/data/observability.sqlite'),
)
const database = openDatabase(databasePath, observationMigrations)

await startService(createObservabilityApp(new ObservationStore(database)), {
  serviceName: 'observability',
  port: Number(process.env.OBSERVABILITY_PORT ?? 4200),
  onClose: () => database.close(),
})
