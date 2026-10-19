import { readFileSync } from 'node:fs'
import type { GateStatus, ReferenceData } from '@durable-jev/contracts'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { buildRuleConfiguration } from './configuration.js'
import { CoordinatorError } from './coordinator-errors.js'
import { type CaseView, CoordinatorService } from './coordinator-service.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')

function startCoordinator() {
  const database = openDatabase(':memory:', coordinatorMigrations)
  const coordinator = new CoordinatorService({
    database,
    configuration: buildRuleConfiguration(
      readJson('rules.json'),
      readJson('mock-policy-parameters.json'),
      { mixingMatrix: readJson('decision-tables/mixing-matrix.json') },
    ),
    referenceData: readJson('mock-data/reference-data.json') as ReferenceData,
    now: () => '2026-11-02T08:00:00.000Z',
  })
  const submitLogOne = () =>
    coordinator.submitCase({
      shipment: logOne.shipment,
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
  return { database, coordinator, submitLogOne }
}

const gateOf = (view: CaseView, ruleId: string): GateStatus | undefined =>
  view.checks.find((check) => check.ruleId === ruleId && check.subject.scope === 'order')
    ?.gateStatus

const openTaskFor = (view: CaseView, ruleId: string) =>
  view.humanTasks.find((task) => task.ruleId === ruleId && task.status === 'OPEN')

function expectStage(
  view: CaseView,
  expected: { orderStatus: string; gates: Record<string, string> },
) {
  expect(view.orderStatus).toBe(expected.orderStatus)
  for (const [ruleId, gateStatus] of Object.entries(expected.gates)) {
    expect({ ruleId, gateStatus: gateOf(view, ruleId) }).toEqual({ ruleId, gateStatus })
  }
}

function expectCoordinatorError(action: () => unknown, code: string) {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(CoordinatorError)
    expect((error as CoordinatorError).code).toBe(code)
    return
  }
  throw new Error(`expected ${code}`)
}

describe('LOG-001 event script', () => {
  it('reaches DISPATCHED through warehouse loading and dispatcher confirmation', () => {
    const { coordinator, submitLogOne } = startCoordinator()
    let view = submitLogOne()

    for (const step of logOne.eventScript) {
      if (step.step === 'completeHumanTask') {
        const task = openTaskFor(view, step.ruleId)
        expect(task?.requiredRole).toBe(step.actor)
        coordinator.completeHumanTask(task?.humanTaskId ?? '', step.actor, step.fields)
        view = coordinator.getCase(view.caseId)
      }
      if (step.step === 'dispatch') view = coordinator.dispatch(view.caseId, step.actor)
      expectStage(view, step.expect)
    }
  })
})

describe('coordinator guards', () => {
  it('rejects loading by the wrong role and without required evidence', () => {
    const { coordinator, submitLogOne } = startCoordinator()
    const loadTask = openTaskFor(submitLogOne(), 'R39-LOAD')?.humanTaskId ?? ''

    expectCoordinatorError(
      () =>
        coordinator.completeHumanTask(loadTask, 'DISPATCHER', {
          loadScanRef: 'S',
          physicalCheckBy: 'x',
        }),
      'FORBIDDEN',
    )
    expectCoordinatorError(
      () => coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', { loadScanRef: 'S' }),
      'UNPROCESSABLE',
    )
    expect(coordinator.getCase(logOne.caseId).orderStatus).toBe('AWAITING_HUMAN')
  })

  it('refuses to dispatch before loading is complete', () => {
    const { coordinator, submitLogOne } = startCoordinator()
    submitLogOne()
    expectCoordinatorError(
      () => coordinator.dispatch(logOne.caseId, 'DISPATCHER'),
      'NOT_READY_TO_DISPATCH',
    )
  })

  it('keeps the confirmation open when someone other than the dispatcher dispatches', () => {
    const { coordinator, submitLogOne } = startCoordinator()
    const loadTask = openTaskFor(submitLogOne(), 'R39-LOAD')?.humanTaskId ?? ''
    coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', {
      loadScanRef: 'S',
      physicalCheckBy: 'op',
    })

    expectCoordinatorError(
      () => coordinator.dispatch(logOne.caseId, 'WAREHOUSE_OPERATOR'),
      'FORBIDDEN',
    )
    const view = coordinator.getCase(logOne.caseId)
    expect(view.orderStatus).toBe('READY_TO_DISPATCH')
    expect(openTaskFor(view, 'R39-CONFIRM')).toBeDefined()
  })

  it('treats a repeated submission as the same case and reserves transport once', () => {
    const { database, submitLogOne } = startCoordinator()
    submitLogOne()
    submitLogOne()
    const reservations = database.prepare('SELECT COUNT(*) AS count FROM reservations').get()
    const cases = database.prepare('SELECT COUNT(*) AS count FROM cases').get()
    expect({ reservations, cases }).toEqual({ reservations: { count: 1 }, cases: { count: 1 } })
  })
})

describe('order state machine', () => {
  function dispatchLogOne() {
    const started = startCoordinator()
    const loadTask = openTaskFor(started.submitLogOne(), 'R39-LOAD')?.humanTaskId ?? ''
    started.coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', {
      loadScanRef: 'S',
      physicalCheckBy: 'op',
    })
    started.coordinator.dispatch(logOne.caseId, 'DISPATCHER')
    return { ...started, loadTask }
  }

  it('keeps a dispatched order dispatched when it is submitted again', () => {
    const { coordinator, submitLogOne } = dispatchLogOne()
    submitLogOne()
    expect(coordinator.getCase(logOne.caseId).orderStatus).toBe('DISPATCHED')
  })

  it('refuses human task commands once the order is dispatched', () => {
    const { coordinator, loadTask } = dispatchLogOne()
    expectCoordinatorError(
      () => coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', { loadScanRef: 'S' }),
      'CONFLICT',
    )
  })

  it('treats a repeated dispatch as idempotent', () => {
    const { coordinator } = dispatchLogOne()
    expect(coordinator.dispatch(logOne.caseId, 'DISPATCHER').orderStatus).toBe('DISPATCHED')
  })
})

describe('uncertain semantic answers', () => {
  it('creates a review task for the configured role and passes once it is approved', () => {
    const { coordinator } = startCoordinator()
    const [firstAnswer, ...otherAnswers] = logOne.scriptedSemanticAnswers
    const view = coordinator.submitCase({
      shipment: logOne.shipment,
      scriptedSemanticAnswers: [
        { ...firstAnswer, answer: { type: 'noul', noul: 0.5 } },
        ...otherAnswers,
      ],
    })
    const reviewTask = openTaskFor(view, 'R03')
    expect(reviewTask?.requiredRole).toBe('TRANSPORT_PLANNER')
    expect(openTaskFor(view, 'R39-LOAD')).toBeUndefined()

    coordinator.approveHumanTask(reviewTask?.humanTaskId ?? '', 'TRANSPORT_PLANNER')
    expect(openTaskFor(coordinator.getCase(logOne.caseId), 'R39-LOAD')).toBeDefined()
  })
})
