import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { A2aTaskLinks, a2aClientMigrations } from '@durable-jev/a2a-adapter'
import { branchServiceMigrations, createBranchServiceApp } from '@durable-jev/branch-service'
import type { ReferenceData, RuleBranch } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase, readUnpublishedOutboxEvents } from '@durable-jev/store'
import { initTracing, Telemetry } from '@durable-jev/telemetry'
import { ensurePlanReservation, reservationMigrations } from '@durable-jev/transport-reservations'
import { afterAll, describe, expect, it } from 'vitest'
import { type BranchProtocol, branchesByService, serviceEvaluators } from './branch.evaluator.js'
import { type CaseView, CoordinatorService } from './coordinator.service.js'
import { coordinatorMigrations } from './persistence/coordinator.migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const configuration = buildRuleConfiguration(
  readJson('rules.json'),
  readJson('mock-policy-parameters.json'),
  {
    mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
    semanticQuestions: readJson('semantic-questions.json'),
  },
)
const referenceData = readJson('mock-data/reference-data.json') as ReferenceData
const closers: (() => void)[] = []
afterAll(() => {
  for (const close of closers) close()
})

async function startService(serviceName: string, branches: readonly RuleBranch[]) {
  let baseUrl = ''
  const database = openDatabase(':memory:', [...branchServiceMigrations, ...reservationMigrations])
  const app = createBranchServiceApp({
    serviceName,
    branches,
    configuration,
    referenceData,
    database,
    publicUrl: () => baseUrl,
    ...(serviceName === 'transport-planning'
      ? { ensurePlanReservation: (request) => ensurePlanReservation(database, request.shipment) }
      : {}),
  })
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  closers.push(() => server.close())
  return baseUrl
}

// A full set of branch services and a coordinator that reaches them over one protocol.
async function coordinatorOver(protocol: BranchProtocol) {
  const urls = {
    cargoAssurance: await startService('cargo-assurance', branchesByService.cargoAssurance),
    transportPlanning: await startService(
      'transport-planning',
      branchesByService.transportPlanning,
    ),
    commercialControl: await startService(
      'commercial-control',
      branchesByService.commercialControl,
    ),
  }
  const database = openDatabase(':memory:', [...coordinatorMigrations, ...a2aClientMigrations])
  const links = new A2aTaskLinks(database)
  const coordinator = new CoordinatorService({
    database,
    configuration,
    evaluators: serviceEvaluators(configuration, referenceData, urls, undefined, {
      protocol,
      links,
    }),
    now: () => '2026-11-02T08:00:00.000Z',
  })
  return { coordinator, links }
}

const summary = (view: CaseView) => ({
  orderStatus: view.orderStatus,
  gates: Object.fromEntries(
    view.checks.map((check) => [`${check.ruleId}@${check.subject.entityId}`, check.gateStatus]),
  ),
  openTasks: view.humanTasks
    .filter((task) => task.status === 'OPEN')
    .map((task) => `${task.ruleId}:${task.requiredRole}`)
    .sort(),
})

async function runLogOneAndThree(coordinator: CoordinatorService) {
  const results: ReturnType<typeof summary>[] = []
  for (const name of ['LOG-001', 'LOG-003']) {
    const caseFile = readJson(`cases/${name}.json`)
    results.push(
      summary(
        await coordinator.submitCase({
          shipment: caseFile.shipment,
          evidence: caseFile.evidence,
          scriptedSemanticAnswers: caseFile.scriptedSemanticAnswers,
        }),
      ),
    )
  }
  const loadTask = coordinator.listOpenHumanTasks('WAREHOUSE_OPERATOR')[0]
  if (!loadTask) throw new Error('LOG-001 should wait for loading')
  await coordinator.completeHumanTask(loadTask.humanTaskId, 'WAREHOUSE_OPERATOR', {
    loadScanRef: 'SCAN-1',
    physicalCheckBy: 'op-2',
  })
  results.push(summary(await coordinator.dispatch(loadTask.caseId, 'DISPATCHER')))
  return results
}

describe('switching the branch protocol', () => {
  it('gives the same order outcomes over A2A as over native HTTP (H4)', async () => {
    const native = await coordinatorOver('native')
    const a2a = await coordinatorOver('a2a')
    const overNative = await runLogOneAndThree(native.coordinator)
    const overA2a = await runLogOneAndThree(a2a.coordinator)

    expect(overA2a).toEqual(overNative)
    expect(overNative.at(-1)?.orderStatus).toBe('DISPATCHED')
    const capabilities = new Set(a2a.links.forCase('CASE-LOG-001').map((link) => link.capability))
    expect(capabilities).toEqual(
      new Set(['cargo-assurance', 'transport-planning', 'commercial-control']),
    )
    expect(native.links.forCase('CASE-LOG-001')).toEqual([])
  })

  it.each(['native', 'a2a'] as const)(
    'carries one trace from the coordinator into every branch service over %s',
    async (protocol) => {
      const observed = openDatabase(':memory:')
      initTracing(new Telemetry('test', observed))
      const { coordinator } = await coordinatorOver(protocol)
      const caseFile = readJson('cases/LOG-001.json')
      await coordinator.submitCase({
        shipment: caseFile.shipment,
        evidence: caseFile.evidence,
        scriptedSemanticAnswers: caseFile.scriptedSemanticAnswers,
      })
      const spans = readUnpublishedOutboxEvents(observed, 100_000)
        .map(
          (row) =>
            row.payload as {
              kind: string
              eventName: string
              traceId: string
              spanId: string
              parentSpanId?: string
            },
        )
        .filter((event) => event.kind === 'span')
      const root = spans.find((span) => span.eventName === 'case.evaluate')
      expect(root).toBeDefined()
      const served = spans.filter(
        (span) => span.eventName === 'POST /evaluations' || span.eventName === 'POST /a2a/jsonrpc',
      )
      expect(served.length).toBeGreaterThanOrEqual(3)
      expect(new Set(spans.map((span) => span.traceId))).toEqual(new Set([root?.traceId]))
      // Each served request's parent is the coordinator's branch.evaluate span for that service.
      const branchCalls = new Set(
        spans.filter((span) => span.eventName === 'branch.evaluate').map((span) => span.spanId),
      )
      expect(served.every((span) => span.parentSpanId && branchCalls.has(span.parentSpanId))).toBe(
        true,
      )
      expect(spans.some((span) => span.eventName === 'rules.evaluate')).toBe(true)
      expect(spans.some((span) => span.eventName === 'jev.ask')).toBe(true)
    },
  )
})
