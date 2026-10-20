import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  CoordinatorService,
  coordinatorMigrations,
  type Investigator,
  inProcessEvaluators,
} from '@durable-jev/coordinator'
import { loadCase, loadReferenceData, loadReplayConfiguration } from '@durable-jev/eval-runner'
import type { JudgeFor } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { reservationMigrations } from '@durable-jev/transport-reservations'

export const repositoryRoot = resolve(import.meta.dirname, '../../..')
export const configuration = loadReplayConfiguration()
export const referenceData = loadReferenceData()

export const workDirectory = (name: string) => mkdtempSync(join(tmpdir(), `fault-${name}-`))

export function coordinatorInProcess(
  options: {
    judgeFor?: JudgeFor
    investigator?: (current: () => CoordinatorService) => Investigator
  } = {},
) {
  const directory = workDirectory('coordinator')
  let coordinator: CoordinatorService | undefined
  coordinator = new CoordinatorService({
    database: openDatabase(join(directory, 'coordinator.sqlite'), coordinatorMigrations),
    configuration,
    evaluators: inProcessEvaluators(
      configuration,
      referenceData,
      openDatabase(join(directory, 'reservations.sqlite'), reservationMigrations),
      options.judgeFor,
    ),
    ...(options.investigator
      ? { investigator: options.investigator(() => coordinator as CoordinatorService) }
      : {}),
  })
  return coordinator
}

export async function submit(coordinator: CoordinatorService, caseName: string) {
  const caseFile = loadCase(caseName)
  return coordinator.submitCase({
    shipment: caseFile.shipment,
    evidence: caseFile.evidence,
    scriptedSemanticAnswers: caseFile.scriptedSemanticAnswers,
  })
}

export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolvePort(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

// Runs a TypeScript script in its own process, the way a crash test needs it.
export function runScript(script: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('pnpm', ['exec', 'tsx', resolve(repositoryRoot, script), ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr }
}

export async function startCoordinatorProcess(port: number, directory: string) {
  const child = spawn(
    process.execPath,
    [resolve(repositoryRoot, 'apps/coordinator/dist/main.js')],
    {
      env: {
        ...process.env,
        COORDINATOR_PORT: String(port),
        COORDINATOR_DB: join(directory, 'coordinator.sqlite'),
        TRANSPORT_PLANNING_DB: join(directory, 'reservations.sqlite'),
        CARGO_ASSURANCE_URL: '',
        TRANSPORT_PLANNING_URL: '',
        COMMERCIAL_CONTROL_URL: '',
        MODEL_MODE: 'scripted',
      },
      stdio: 'ignore',
    },
  )
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return child
    } catch {}
    await new Promise((wait) => setTimeout(wait, 150))
  }
  child.kill('SIGKILL')
  throw new Error('the coordinator process did not start')
}

export async function callJson(
  url: string,
  options: { method?: string; role?: string; body?: unknown } = {},
) {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.role ? { 'x-demo-role': options.role } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  return { status: response.status, body: (await response.json()) as never }
}
