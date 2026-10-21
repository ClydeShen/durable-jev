import { readFileSync } from 'node:fs'
import { BranchUnavailableError } from '@durable-jev/branch-service'
import type { GateStatus, ReferenceData } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch.evaluator.js'
import { CoordinatorError } from './coordinator.errors.js'
import { type CaseView, CoordinatorService } from './coordinator.service.js'
import { coordinatorMigrations } from './persistence/coordinator.migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')

function startCoordinator() {
  const database = openDatabase(':memory:', coordinatorMigrations)
  const configuration = buildRuleConfiguration(
    readJson('rules.json'),
    readJson('mock-policy-parameters.json'),
    {
      mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
      semanticQuestions: readJson('semantic-questions.json'),
    },
  )
  const coordinator = new CoordinatorService({
    database,
    configuration,
    evaluators: inProcessEvaluators(
      configuration,
      readJson('mock-data/reference-data.json') as ReferenceData,
    ),
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

async function expectCoordinatorError(action: () => unknown, code: string) {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(CoordinatorError)
    expect((error as CoordinatorError).code).toBe(code)
    return
  }
  throw new Error(`expected ${code}`)
}

describe('LOG-001 event script', () => {
  it('reaches DISPATCHED through warehouse loading and dispatcher confirmation', async () => {
    const { coordinator, submitLogOne } = startCoordinator()
    let view = await submitLogOne()

    for (const step of logOne.eventScript) {
      if (step.step === 'completeHumanTask') {
        const task = openTaskFor(view, step.ruleId)
        expect(task?.requiredRole).toBe(step.actor)
        await coordinator.completeHumanTask(task?.humanTaskId ?? '', step.actor, step.fields)
        view = coordinator.getCase(view.caseId)
      }
      if (step.step === 'dispatch') view = await coordinator.dispatch(view.caseId, step.actor)
      expectStage(view, step.expect)
    }
  })
})

describe('coordinator guards', () => {
  it('rejects loading by the wrong role and without required evidence', async () => {
    const { coordinator, submitLogOne } = startCoordinator()
    const loadTask = openTaskFor(await submitLogOne(), 'R39-LOAD')?.humanTaskId ?? ''

    await expectCoordinatorError(
      () =>
        coordinator.completeHumanTask(loadTask, 'DISPATCHER', {
          loadScanRef: 'S',
          physicalCheckBy: 'x',
        }),
      'FORBIDDEN',
    )
    await expectCoordinatorError(
      () => coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', { loadScanRef: 'S' }),
      'UNPROCESSABLE',
    )
    expect(coordinator.getCase(logOne.caseId).orderStatus).toBe('AWAITING_HUMAN')
  })

  it('rejects decision conditions the gate does not declare', async () => {
    const { coordinator } = startCoordinator()
    const [firstAnswer, ...otherAnswers] = logOne.scriptedSemanticAnswers
    const view = await coordinator.submitCase({
      shipment: logOne.shipment,
      scriptedSemanticAnswers: [
        { ...firstAnswer, answer: { type: 'noul', noul: 0.5 } },
        ...otherAnswers,
      ],
    })
    const reviewTask = openTaskFor(view, 'R03')?.humanTaskId ?? ''
    await expectCoordinatorError(
      () =>
        coordinator.approveHumanTask(reviewTask, 'TRANSPORT_PLANNER', undefined, [
          'REWORK_REQUIRED',
        ]),
      'UNPROCESSABLE',
    )
  })

  it('refuses to dispatch before loading is complete', async () => {
    const { coordinator, submitLogOne } = startCoordinator()
    await submitLogOne()
    await expectCoordinatorError(
      () => coordinator.dispatch(logOne.caseId, 'DISPATCHER'),
      'NOT_READY_TO_DISPATCH',
    )
  })

  it('keeps the confirmation open when someone other than the dispatcher dispatches', async () => {
    const { coordinator, submitLogOne } = startCoordinator()
    const loadTask = openTaskFor(await submitLogOne(), 'R39-LOAD')?.humanTaskId ?? ''
    await coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', {
      loadScanRef: 'S',
      physicalCheckBy: 'op',
    })

    await expectCoordinatorError(
      () => coordinator.dispatch(logOne.caseId, 'WAREHOUSE_OPERATOR'),
      'FORBIDDEN',
    )
    const view = coordinator.getCase(logOne.caseId)
    expect(view.orderStatus).toBe('READY_TO_DISPATCH')
    expect(openTaskFor(view, 'R39-CONFIRM')).toBeDefined()
  })

  it('treats a repeated submission as the same case', async () => {
    const { database, submitLogOne } = startCoordinator()
    await submitLogOne()
    await submitLogOne()
    expect(database.prepare('SELECT COUNT(*) AS count FROM cases').get()).toEqual({ count: 1 })
  })
})

describe('order state machine', () => {
  async function dispatchLogOne() {
    const started = startCoordinator()
    const loadTask = openTaskFor(await started.submitLogOne(), 'R39-LOAD')?.humanTaskId ?? ''
    await started.coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', {
      loadScanRef: 'S',
      physicalCheckBy: 'op',
    })
    await started.coordinator.dispatch(logOne.caseId, 'DISPATCHER')
    return { ...started, loadTask }
  }

  it('keeps a dispatched order dispatched when it is submitted again', async () => {
    const { coordinator, submitLogOne } = await dispatchLogOne()
    await submitLogOne()
    expect(coordinator.getCase(logOne.caseId).orderStatus).toBe('DISPATCHED')
  })

  it('refuses human task commands once the order is dispatched', async () => {
    const { coordinator, loadTask } = await dispatchLogOne()
    await expectCoordinatorError(
      () => coordinator.completeHumanTask(loadTask, 'WAREHOUSE_OPERATOR', { loadScanRef: 'S' }),
      'CONFLICT',
    )
  })

  it('treats a repeated dispatch as idempotent', async () => {
    const { coordinator } = await dispatchLogOne()
    expect((await coordinator.dispatch(logOne.caseId, 'DISPATCHER')).orderStatus).toBe('DISPATCHED')
  })
})

describe('uncertain semantic answers', () => {
  it('creates a review task for the configured role and passes once it is approved', async () => {
    const { coordinator } = startCoordinator()
    const [firstAnswer, ...otherAnswers] = logOne.scriptedSemanticAnswers
    const view = await coordinator.submitCase({
      shipment: logOne.shipment,
      scriptedSemanticAnswers: [
        { ...firstAnswer, answer: { type: 'noul', noul: 0.5 } },
        ...otherAnswers,
      ],
    })
    const reviewTask = openTaskFor(view, 'R03')
    expect(reviewTask?.requiredRole).toBe('TRANSPORT_PLANNER')
    expect(openTaskFor(view, 'R39-LOAD')).toBeUndefined()

    await coordinator.approveHumanTask(reviewTask?.humanTaskId ?? '', 'TRANSPORT_PLANNER')
    expect(openTaskFor(coordinator.getCase(logOne.caseId), 'R39-LOAD')).toBeDefined()
  })
})

describe('branch service outage', () => {
  it('marks the order as a technical failure and recovers on re-evaluation', async () => {
    const configuration = buildRuleConfiguration(
      readJson('rules.json'),
      readJson('mock-policy-parameters.json'),
      {
        mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
        semanticQuestions: readJson('semantic-questions.json'),
      },
    )
    const evaluators = inProcessEvaluators(configuration, readJson('mock-data/reference-data.json'))
    let commercialIsDown = true
    const commercial = evaluators[3] as (typeof evaluators)[number]
    const flakyCommercial = {
      ...commercial,
      evaluate: async (request: Parameters<typeof commercial.evaluate>[0]) => {
        if (commercialIsDown)
          throw new BranchUnavailableError(commercial.name, 'connection refused')
        return commercial.evaluate(request)
      },
    }
    const coordinator = new CoordinatorService({
      database: openDatabase(':memory:', coordinatorMigrations),
      configuration,
      evaluators: evaluators.map((evaluator) =>
        evaluator === commercial ? flakyCommercial : evaluator,
      ),
    })

    await expect(
      coordinator.submitCase({
        shipment: logOne.shipment,
        scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
      }),
    ).rejects.toBeInstanceOf(BranchUnavailableError)
    expect(coordinator.getCase(logOne.caseId).orderStatus).toBe('TECHNICAL_FAILURE')

    commercialIsDown = false
    expect((await coordinator.reevaluate(logOne.caseId)).orderStatus).toBe('AWAITING_HUMAN')
  })
})

describe('parallel evaluation', () => {
  it('evaluates independent branches at the same time', async () => {
    const configuration = buildRuleConfiguration(
      readJson('rules.json'),
      readJson('mock-policy-parameters.json'),
      {
        mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
        semanticQuestions: readJson('semantic-questions.json'),
      },
    )
    const evaluators = inProcessEvaluators(configuration, readJson('mock-data/reference-data.json'))
    let commercialStarted: () => void = () => {}
    const commercialHasStarted = new Promise<void>((resolve) => {
      commercialStarted = resolve
    })
    const instrumented = evaluators.map((evaluator) => {
      if (evaluator.branches.includes('commercial')) {
        return {
          ...evaluator,
          evaluate: (request: Parameters<typeof evaluator.evaluate>[0]) => {
            commercialStarted()
            return evaluator.evaluate(request)
          },
        }
      }
      if (evaluator.branches.includes('base')) {
        return {
          ...evaluator,
          evaluate: async (request: Parameters<typeof evaluator.evaluate>[0]) => {
            const notConcurrent = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('commercial did not start alongside base')), 1000),
            )
            await Promise.race([commercialHasStarted, notConcurrent])
            return evaluator.evaluate(request)
          },
        }
      }
      return evaluator
    })
    const coordinator = new CoordinatorService({
      database: openDatabase(':memory:', coordinatorMigrations),
      configuration,
      evaluators: instrumented,
    })
    const view = await coordinator.submitCase({
      shipment: logOne.shipment,
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
    expect(view.orderStatus).toBe('AWAITING_HUMAN')
  })
})
