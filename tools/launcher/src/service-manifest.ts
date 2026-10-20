import { resolve } from 'node:path'
import type { ManagedProcessDefinition } from './process-supervisor.js'

export const repositoryRoot = resolve(import.meta.dirname, '../../..')
export const dataDirectory = resolve(repositoryRoot, 'var/data')

export const ports = {
  launcher: 4000,
  coordinator: 4100,
  cargoAssurance: 4110,
  transportPlanning: 4120,
  commercialControl: 4130,
  web: 5173,
} as const

const serviceUrl = (port: number) => `http://127.0.0.1:${port}`

export type DataService = { name: string; databasePath: string }

function branchService(name: string, port: number): ManagedProcessDefinition & DataService {
  const databasePath = resolve(dataDirectory, `${name}.sqlite`)
  return {
    name,
    databasePath,
    command: process.execPath,
    args: [resolve(repositoryRoot, `apps/${name}/dist/main.js`)],
    env: { SERVICE_PORT: String(port), SERVICE_DB: databasePath },
    healthUrl: `${serviceUrl(port)}/health`,
  }
}

const branchServices = [
  branchService('cargo-assurance', ports.cargoAssurance),
  branchService('transport-planning', ports.transportPlanning),
  branchService('commercial-control', ports.commercialControl),
]

const coordinatorDatabasePath = resolve(dataDirectory, 'coordinator.sqlite')

const coordinator: ManagedProcessDefinition & DataService = {
  name: 'coordinator',
  databasePath: coordinatorDatabasePath,
  command: process.execPath,
  args: [resolve(repositoryRoot, 'apps/coordinator/dist/main.js')],
  env: {
    COORDINATOR_PORT: String(ports.coordinator),
    COORDINATOR_DB: coordinatorDatabasePath,
    CARGO_ASSURANCE_URL: serviceUrl(ports.cargoAssurance),
    TRANSPORT_PLANNING_URL: serviceUrl(ports.transportPlanning),
    COMMERCIAL_CONTROL_URL: serviceUrl(ports.commercialControl),
  },
  healthUrl: `${serviceUrl(ports.coordinator)}/health`,
}

export const dataServices: readonly DataService[] = [...branchServices, coordinator]

export const serviceManifest: ManagedProcessDefinition[] = [
  ...branchServices,
  coordinator,
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
      COORDINATOR_URL: serviceUrl(ports.coordinator),
      LAUNCHER_URL: serviceUrl(ports.launcher),
    },
    healthUrl: `${serviceUrl(ports.web)}/`,
  },
]
