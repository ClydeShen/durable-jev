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
  observability: 4200,
  web: 5173,
} as const

const serviceUrl = (port: number) => `http://127.0.0.1:${port}`

export type DataService = { name: string; databasePath: string }

const observabilityUrl = serviceUrl(ports.observability)

function branchService(name: string, port: number): ManagedProcessDefinition & DataService {
  const databasePath = resolve(dataDirectory, `${name}.sqlite`)
  return {
    name,
    databasePath,
    command: process.execPath,
    args: [resolve(repositoryRoot, `apps/${name}/dist/main.js`)],
    env: {
      SERVICE_PORT: String(port),
      SERVICE_DB: databasePath,
      DEMO_FAULTS: 'on',
      OBSERVABILITY_URL: observabilityUrl,
    },
    healthUrl: `${serviceUrl(port)}/health`,
  }
}

const branchServices = [
  branchService('cargo-assurance', ports.cargoAssurance),
  branchService('transport-planning', ports.transportPlanning),
  branchService('commercial-control', ports.commercialControl),
]

// Services the workbench may slow down to show a timeout.
export const slowableServices: Readonly<Record<string, string>> = Object.fromEntries(
  branchServices.map((service) => [
    service.name,
    (service.healthUrl ?? '').replace(/\/health$/, ''),
  ]),
)

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
    OBSERVABILITY_URL: observabilityUrl,
  },
  healthUrl: `${serviceUrl(ports.coordinator)}/health`,
}

// Starts first: the services' relays deliver to it from their first event.
const observabilityDatabasePath = resolve(dataDirectory, 'observability.sqlite')

const observability: ManagedProcessDefinition & DataService = {
  name: 'observability',
  databasePath: observabilityDatabasePath,
  command: process.execPath,
  args: [resolve(repositoryRoot, 'apps/observability/dist/main.js')],
  env: {
    OBSERVABILITY_PORT: String(ports.observability),
    OBSERVABILITY_DB: observabilityDatabasePath,
  },
  healthUrl: `${observabilityUrl}/health`,
}

export const dataServices: readonly DataService[] = [observability, ...branchServices, coordinator]

export const serviceManifest: ManagedProcessDefinition[] = [
  observability,
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
      OBSERVABILITY_URL: observabilityUrl,
    },
    healthUrl: `${serviceUrl(ports.web)}/`,
  },
]
