import { readFileSync } from 'node:fs'
import type { ReferenceData } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase, readUnpublishedOutboxEvents } from '@durable-jev/store'
import { initTracing, Telemetry } from '@durable-jev/telemetry'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch-evaluators.js'
import { CoordinatorService } from './coordinator-service.js'
import { inProcessInvestigator } from './investigator.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

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

function observedCoordinator() {
  const database = openDatabase(':memory:', coordinatorMigrations)
  const coordinator = new CoordinatorService({
    database,
    configuration,
    evaluators: inProcessEvaluators(configuration, referenceData),
    investigator: inProcessInvestigator(configuration, referenceData),
    telemetry: new Telemetry('coordinator', database),
  })
  const events = () =>
    readUnpublishedOutboxEvents(database, 100_000).map(
      (row) =>
        row.payload as {
          eventName: string
          correlationId: string
          attributes?: Record<string, unknown>
        },
    )
  return { coordinator, events }
}

const submit = (coordinator: CoordinatorService, name: string) => {
  const caseFile = readJson(`cases/${name}.json`)
  return coordinator.submitCase({
    shipment: caseFile.shipment,
    evidence: caseFile.evidence,
    scriptedSemanticAnswers: caseFile.scriptedSemanticAnswers,
  })
}

describe('coordinator telemetry', () => {
  it('records the whole life of an order under one correlation id', async () => {
    const { coordinator, events } = observedCoordinator()
    const view = await submit(coordinator, 'LOG-001')
    const load = view.humanTasks.find((task) => task.ruleId === 'R39-LOAD')
    await coordinator.completeHumanTask(load?.humanTaskId ?? '', 'WAREHOUSE_OPERATOR', {
      loadScanRef: 'SCAN-1',
      physicalCheckBy: 'op-2',
    })
    await coordinator.dispatch(view.caseId, 'DISPATCHER')

    const names = events().map((event) => event.eventName)
    expect(names[0]).toBe('case.submitted')
    expect(names).toEqual(
      expect.arrayContaining([
        'rule.evaluated',
        'information.requested',
        'information.received',
        'order.status_changed',
      ]),
    )
    expect(new Set(events().map((event) => event.correlationId))).toEqual(
      new Set([`corr-${view.caseId}`]),
    )
    const statuses = events()
      .filter((event) => event.eventName === 'order.status_changed')
      .map((event) => event.attributes?.to)
    expect(statuses.at(-1)).toBe('DISPATCHED')
    const received = events().find((event) => event.eventName === 'information.received')
    expect(received?.attributes).toMatchObject({
      ruleId: 'R39-LOAD',
      action: 'complete',
      actor: 'WAREHOUSE_OPERATOR',
    })
  })

  it('does not repeat rule events for results that stayed the same', async () => {
    const { coordinator, events } = observedCoordinator()
    const view = await submit(coordinator, 'LOG-001')
    const before = events().filter((event) => event.eventName === 'rule.evaluated').length
    await coordinator.reevaluate(view.caseId)
    expect(events().filter((event) => event.eventName === 'rule.evaluated')).toHaveLength(before)
  })

  it('records a change and what it invalidated', async () => {
    const { coordinator, events } = observedCoordinator()
    const view = await submit(coordinator, 'LOG-004')
    await coordinator.applyChange(
      view.caseId,
      {
        kind: 'changeCarrier',
        legId: 'LOG-004-LEG-1' as never,
        carrierId: 'CAR-GLACIER' as never,
        vehicleId: 'VEH-GL-REEFER-4T' as never,
      },
      'TRANSPORT_PLANNER',
    )
    const applied = events().find((event) => event.eventName === 'change.applied')
    const invalidated = events().find(
      (event) => event.eventName === 'result.invalidated' && event.attributes?.changeId,
    )
    expect(applied?.attributes).toMatchObject({ kind: 'changeCarrier', actor: 'TRANSPORT_PLANNER' })
    expect(invalidated?.attributes?.ruleIds).toEqual(expect.arrayContaining(['R11']))
  })

  it('records each dispatch to a branch', async () => {
    const { coordinator, events } = observedCoordinator()
    await submit(coordinator, 'LOG-001')
    const dispatched = events()
      .filter((event) => event.eventName === 'task.dispatched')
      .map((event) => event.attributes?.evaluator)
    expect(new Set(dispatched)).toEqual(
      new Set(['coordinator', 'cargo-assurance', 'transport-planning', 'commercial-control']),
    )
  })

  it('records the agent run and a recommendation that does not change the plan', async () => {
    const { coordinator, events } = observedCoordinator()
    const view = await submit(coordinator, 'LOG-004')
    await coordinator.investigateCarrier(
      view.caseId,
      {
        legId: 'LOG-004-LEG-1',
        unavailableCarrierIds: ['CAR-SECURA'],
        reason: 'Carrier cancelled',
      },
      'TRANSPORT_PLANNER',
    )
    const names = events().map((event) => event.eventName)
    expect(names).toEqual(
      expect.arrayContaining([
        'run.started',
        'tool.completed',
        'run.completed',
        'case.recommended',
      ]),
    )
    const recommended = events().find((event) => event.eventName === 'case.recommended')
    expect(recommended?.attributes).toMatchObject({
      carrierId: 'CAR-GLACIER',
      appliesToPlan: false,
    })
    expect(events().some((event) => event.eventName === 'change.applied')).toBe(false)
  })

  it('answers a human task in a new trace that links back to the one that asked', async () => {
    const database = openDatabase(':memory:', coordinatorMigrations)
    const telemetry = new Telemetry('coordinator', database)
    initTracing(telemetry)
    const coordinator = new CoordinatorService({
      database,
      configuration,
      evaluators: inProcessEvaluators(configuration, referenceData),
      telemetry,
    })
    const view = await submit(coordinator, 'LOG-001')
    const load = view.humanTasks.find((task) => task.ruleId === 'R39-LOAD')
    // Hours later, a separate request.
    await coordinator.completeHumanTask(load?.humanTaskId ?? '', 'WAREHOUSE_OPERATOR', {
      loadScanRef: 'SCAN-1',
      physicalCheckBy: 'op-2',
    })
    const spans = readUnpublishedOutboxEvents(database, 100_000)
      .map(
        (row) =>
          row.payload as {
            kind: string
            eventName: string
            traceId: string
            spanId: string
            links?: { traceId: string; spanId: string; relation: string }[]
            correlationId: string
          },
      )
      .filter((event) => event.kind === 'span')
    const asked = spans.find((span) => span.eventName === 'case.reevaluate')
    const answered = spans.find((span) => span.eventName === 'human.act')
    expect(answered?.traceId).not.toBe(asked?.traceId)
    expect(answered?.correlationId).toBe(asked?.correlationId)
    expect(answered?.links).toEqual([
      { traceId: asked?.traceId, spanId: asked?.spanId, relation: 'answers' },
    ])
  })

  it('records after a restart which waiting orders found their tasks still open', async () => {
    const database = openDatabase(':memory:', coordinatorMigrations)
    const build = () =>
      new CoordinatorService({
        database,
        configuration,
        evaluators: inProcessEvaluators(configuration, referenceData),
        telemetry: new Telemetry('coordinator', database),
      })
    const view = await submit(build(), 'LOG-006')
    const waiting = view.humanTasks
      .filter((task) => task.status === 'OPEN')
      .map((task) => task.humanTaskId)

    const restarted = build()
    expect(restarted.recordRestart()).toBe(1)
    const resumed = readUnpublishedOutboxEvents(database, 100_000)
      .map(
        (row) =>
          row.payload as {
            eventName: string
            caseId: string
            attributes?: Record<string, unknown>
          },
      )
      .find((event) => event.eventName === 'run.resumed')
    expect(resumed).toMatchObject({
      caseId: view.caseId,
      attributes: { scope: 'coordinator', reason: 'process restarted', openHumanTasks: waiting },
    })
  })
})
