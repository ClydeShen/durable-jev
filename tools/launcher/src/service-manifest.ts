import { resolve } from 'node:path'
import type { ManagedProcessDefinition } from './process-supervisor.js'

export const repositoryRoot = resolve(import.meta.dirname, '../../..')
export const dataDirectory = resolve(repositoryRoot, 'var/data')

export const ports = { launcher: 4000, coordinator: 4100, web: 5173 } as const

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
  {
    name: 'web',
    command: process.execPath,
    args: [
      resolve(repositoryRoot, 'apps/web/node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
    ],
    cwd: resolve(repositoryRoot, 'apps/web'),
    env: {
      WEB_PORT: String(ports.web),
      COORDINATOR_URL: `http://127.0.0.1:${ports.coordinator}`,
      LAUNCHER_URL: `http://127.0.0.1:${ports.launcher}`,
    },
    healthUrl: `http://127.0.0.1:${ports.web}/`,
  },
]
