import { resolve } from 'node:path'
import type { ManagedProcessDefinition } from './process-supervisor.js'

export const repositoryRoot = resolve(import.meta.dirname, '../../..')
export const dataDirectory = resolve(repositoryRoot, 'var/data')

export const ports = { launcher: 4000, coordinator: 4100 } as const

export const coordinatorDatabasePath = resolve(dataDirectory, 'coordinator.sqlite')

export const serviceManifest: ManagedProcessDefinition[] = [
  {
    name: 'coordinator',
    command: process.execPath,
    args: [resolve(repositoryRoot, 'apps/coordinator/dist/main.js')],
    env: {
      COORDINATOR_PORT: String(ports.coordinator),
      COORDINATOR_DB: coordinatorDatabasePath,
    },
    healthUrl: `http://127.0.0.1:${ports.coordinator}/health`,
  },
]
