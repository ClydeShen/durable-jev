import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GateStatus } from '@durable-jev/contracts'
import {
  type CaseView,
  CoordinatorError,
  CoordinatorService,
  coordinatorMigrations,
  inProcessEvaluators,
} from '@durable-jev/coordinator'
import {
  buildRuleConfiguration,
  loadReferenceData,
  type RuleConfiguration,
} from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { reservationMigrations } from '@durable-jev/transport-reservations'
import type { CaseFile, EventScriptStep, StageExpectation } from './case-file.js'
import {
  listCaseIds,
  loadCase,
  loadPolicyParameters,
  loadRuleSetFile,
  materialsDirectory,
  readMaterial,
} from './materials.js'

export type StageResult = { index: number; step: EventScriptStep['step']; failures: string[] }
export type CaseReplay = {
  caseId: string
  title: string
  reviewStatus: CaseFile['reviewStatus']
  passed: boolean
  stages: StageResult[]
}

const severityOrder: readonly GateStatus[] = [
  'FAIL',
  'ERROR',
  'WAITING_HUMAN',
  'BLOCKED_DEPENDENCY',
  'UNKNOWN',
  'INVALIDATED',
  'PASS',
  'NOT_APPLICABLE',
]

const fixedNow = () => '2026-11-02T08:00:00.000Z'

export function loadReplayConfiguration(): RuleConfiguration {
  return buildRuleConfiguration(loadRuleSetFile(), loadPolicyParameters() as never, {
    mixingMatrix: readMaterial('decision-tables/mixing-matrix.json'),
    semanticQuestions: readMaterial('semantic-questions.json'),
  })
}

class ReplayedCoordinator {
  private service: CoordinatorService
  readonly lastTaskIds = new Map<string, string>()

  constructor(
    private readonly configuration: RuleConfiguration,
    private readonly databasePath: string,
    private readonly reservationPath: string,
  ) {
    this.service = this.open()
  }

  get coordinator(): CoordinatorService {
    return this.service
  }

  restart(): void {
    this.service = this.open()
  }

  private open(): CoordinatorService {
    return new CoordinatorService({
      database: openDatabase(this.databasePath, coordinatorMigrations),
      configuration: this.configuration,
      evaluators: inProcessEvaluators(
        this.configuration,
        loadReferenceData(join(materialsDirectory, 'mock-data/reference-data.json')),
        openDatabase(this.reservationPath, reservationMigrations),
      ),
      now: fixedNow,
    })
  }
}

function taskIdFor(
  replayed: ReplayedCoordinator,
  caseId: string,
  step: { ruleId: string; reuseLastTask?: boolean | undefined },
): string {
  const remembered = replayed.lastTaskIds.get(step.ruleId)
  if (step.reuseLastTask && remembered) return remembered
  const taskId = openTaskId(replayed.coordinator.getCase(caseId), step.ruleId)
  replayed.lastTaskIds.set(step.ruleId, taskId)
  return taskId
}

function openTaskId(view: CaseView, ruleId: string): string {
  const open = view.humanTasks.filter((task) => task.ruleId === ruleId && task.status === 'OPEN')
  if (open.length !== 1) throw new Error(`expected one open ${ruleId} task, found ${open.length}`)
  return open[0]?.humanTaskId as string
}

async function performStep(
  replayed: ReplayedCoordinator,
  caseFile: CaseFile,
  step: EventScriptStep,
): Promise<void> {
  const { coordinator } = replayed
  const caseId = caseFile.caseId
  switch (step.step) {
    case 'submit':
      await coordinator.submitCase({
        shipment: caseFile.shipment,
        evidence: caseFile.evidence,
        scriptedSemanticAnswers: caseFile.scriptedSemanticAnswers,
      })
      return
    case 'completeHumanTask':
      await coordinator.completeHumanTask(
        taskIdFor(replayed, caseId, step),
        step.actor,
        step.fields,
      )
      return
    case 'approveHumanTask':
      await coordinator.approveHumanTask(
        taskIdFor(replayed, caseId, step),
        step.actor,
        undefined,
        step.conditions,
      )
      return
    case 'rejectHumanTask':
      await coordinator.rejectHumanTask(taskIdFor(replayed, caseId, step), step.actor, step.reason)
      return
    case 'changePlan':
      await coordinator.applyChange(caseId, step.change, step.actor)
      return
    case 'restartCoordinator':
      replayed.restart()
      return
    case 'dispatch':
      await coordinator.dispatch(caseId, step.actor)
      return
  }
}

function gateStatus(view: CaseView, key: string): GateStatus | undefined {
  const [ruleId, entityId] = key.split('@')
  const statuses = view.checks
    .filter(
      (check) => check.ruleId === ruleId && (!entityId || check.subject.entityId === entityId),
    )
    .map((check) => check.gateStatus)
  return severityOrder.find((status) => statuses.includes(status))
}

function compareStage(
  view: CaseView,
  expected: StageExpectation,
  errorCode: string | undefined,
): string[] {
  const failures: string[] = []
  if (expected.error !== errorCode) {
    failures.push(`error: expected ${expected.error ?? 'none'}, got ${errorCode ?? 'none'}`)
  }
  if (expected.orderStatus && view.orderStatus !== expected.orderStatus) {
    failures.push(`orderStatus: expected ${expected.orderStatus}, got ${view.orderStatus}`)
  }
  for (const [key, status] of Object.entries(expected.gates ?? {})) {
    const actual = gateStatus(view, key)
    if (actual !== status) failures.push(`${key}: expected ${status}, got ${actual ?? 'missing'}`)
  }
  if (expected.openHumanTasks) {
    const describe = (tasks: { ruleId: string; requiredRole: string }[]) =>
      tasks
        .map((task) => `${task.ruleId}:${task.requiredRole}`)
        .sort()
        .join(', ')
    const actual = describe(view.humanTasks.filter((task) => task.status === 'OPEN'))
    const wanted = describe(expected.openHumanTasks)
    if (actual !== wanted) failures.push(`open tasks: expected [${wanted}], got [${actual}]`)
  }
  const invalidated = new Set<string>(view.changes.at(-1)?.invalidatedRuleIds ?? [])
  for (const ruleId of expected.invalidated ?? []) {
    if (!invalidated.has(ruleId))
      failures.push(`${ruleId} should have been invalidated by the change`)
  }
  for (const ruleId of expected.notInvalidated ?? []) {
    if (invalidated.has(ruleId))
      failures.push(`${ruleId} should not have been invalidated by the change`)
  }
  return failures
}

function errorCodeOf(error: unknown): string {
  if (error instanceof CoordinatorError) return error.code
  return error instanceof Error ? error.message : String(error)
}

export async function replayCase(
  caseFile: CaseFile,
  configuration: RuleConfiguration = loadReplayConfiguration(),
): Promise<CaseReplay> {
  const workDirectory = mkdtempSync(join(tmpdir(), `replay-${caseFile.caseId}-`))
  try {
    const replayed = new ReplayedCoordinator(
      configuration,
      join(workDirectory, 'coordinator.sqlite'),
      join(workDirectory, 'transport-planning.sqlite'),
    )
    const stages: StageResult[] = []
    for (const [index, step] of caseFile.eventScript.entries()) {
      let errorCode: string | undefined
      try {
        await performStep(replayed, caseFile, step)
      } catch (error) {
        errorCode = errorCodeOf(error)
      }
      const view = replayed.coordinator.getCase(caseFile.caseId)
      stages.push({ index, step: step.step, failures: compareStage(view, step.expect, errorCode) })
    }
    return {
      caseId: caseFile.caseId,
      title: caseFile.title,
      reviewStatus: caseFile.reviewStatus,
      passed: stages.every((stage) => stage.failures.length === 0),
      stages,
    }
  } finally {
    rmSync(workDirectory, { recursive: true, force: true })
  }
}

export async function replayAllCases(): Promise<CaseReplay[]> {
  const configuration = loadReplayConfiguration()
  const results: CaseReplay[] = []
  for (const caseName of listCaseIds())
    results.push(await replayCase(loadCase(caseName), configuration))
  return results
}
