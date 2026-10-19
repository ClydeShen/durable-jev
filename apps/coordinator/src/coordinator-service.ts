import type {
  CheckResult,
  CheckResultId,
  CheckSubject,
  EvidenceRef,
  HumanTask,
  HumanTaskId,
  HumanTaskTarget,
  ReferenceData,
  Role,
  RuleId,
  Shipment,
  UtcTimestamp,
} from '@durable-jev/contracts'
import {
  applyHumanTaskCommand,
  createHumanTask,
  expireIfDue,
  type HumanTaskCommand,
  humanGateStatus,
  supersedeForNewTarget,
  targetsMatch,
} from '@durable-jev/human-tasks'
import {
  computeInputFingerprint,
  evaluateRuleGraph,
  type RuleDefinition,
  type RuleEvaluation,
  subjectKey,
  upstreamRuleIds,
} from '@durable-jev/rule-engine'
import { executeOnce, type StoreDatabase } from '@durable-jev/store'
import type { RuleConfiguration } from './configuration.js'
import { CoordinatorError } from './coordinator-errors.js'
import { deriveOrderStatus, dispatchConfirmationRuleId, finalGateRuleId } from './order-status.js'
import { CoordinatorRepository, type StoredCase } from './persistence/coordinator-repository.js'
import type { EvaluationInputs, SemanticAnswer } from './rules/evaluation-inputs.js'
import { evaluateLeafRule } from './rules/leaf-evaluators.js'

export type CoordinatorDependencies = {
  database: StoreDatabase
  configuration: RuleConfiguration
  referenceData: ReferenceData
  now?: () => string
}

export type SubmitCaseRequest = {
  shipment: Shipment
  scriptedSemanticAnswers?: { ruleId: string; entityId: string; answer: SemanticAnswer }[]
}

export type CaseView = StoredCase & { checks: CheckResult[]; humanTasks: HumanTask[] }

type HumanTaskAction =
  | { kind: 'approve'; reason?: string }
  | { kind: 'reject'; reason: string }
  | { kind: 'complete'; fields: Record<string, string>; evidenceRefs: EvidenceRef[] }

const preloadGateRuleIds = new Set(['R13', 'R20', 'R21', 'R22', 'R34', 'R35'])
const minutesFrom = (timestamp: string, minutes: number) =>
  new Date(Date.parse(timestamp) + minutes * 60_000).toISOString()

export class CoordinatorService {
  private readonly repository: CoordinatorRepository
  private readonly database: StoreDatabase
  private readonly configuration: RuleConfiguration
  private readonly referenceData: ReferenceData
  private readonly now: () => string
  private readonly rulesById: Map<string, RuleDefinition>

  constructor(dependencies: CoordinatorDependencies) {
    this.database = dependencies.database
    this.repository = new CoordinatorRepository(dependencies.database)
    this.configuration = dependencies.configuration
    this.referenceData = dependencies.referenceData
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.rulesById = new Map(
      dependencies.configuration.rulesInEvaluationOrder.map((rule) => [rule.ruleId, rule]),
    )
  }

  submitCase(request: SubmitCaseRequest): CaseView {
    const caseId = request.shipment.caseId
    const submit = this.database.transaction(() => {
      if (this.repository.findCase(caseId)) return
      const now = this.now()
      this.repository.insertCase({
        caseId,
        correlationId: `corr-${caseId}`,
        shipment: request.shipment,
        orderStatus: 'SUBMITTED',
        createdAt: now,
        updatedAt: now,
      })
      for (const scripted of request.scriptedSemanticAnswers ?? []) {
        this.repository.saveSemanticAnswer(
          caseId,
          scripted.ruleId,
          scripted.entityId,
          scripted.answer,
        )
      }
      this.evaluateAndPersist(caseId)
    })
    submit.immediate()
    return this.getCase(caseId)
  }

  getCase(caseId: string): CaseView {
    const stored = this.requireCase(caseId)
    return {
      ...stored,
      checks: this.repository.listCheckResults(caseId),
      humanTasks: this.repository.listHumanTasks({ caseId }),
    }
  }

  listCases(): StoredCase[] {
    return this.repository.listCases()
  }

  listOpenHumanTasks(role?: Role): HumanTask[] {
    return this.repository
      .listHumanTasks({ status: 'OPEN' })
      .filter((task) => !role || task.requiredRole === role)
  }

  approveHumanTask(humanTaskId: string, actor: Role, reason?: string): HumanTask {
    return this.actOnHumanTask(humanTaskId, actor, {
      kind: 'approve',
      ...(reason === undefined ? {} : { reason }),
    })
  }

  rejectHumanTask(humanTaskId: string, actor: Role, reason: string): HumanTask {
    return this.actOnHumanTask(humanTaskId, actor, { kind: 'reject', reason })
  }

  completeHumanTask(
    humanTaskId: string,
    actor: Role,
    fields: Record<string, string>,
    evidenceRefs: EvidenceRef[] = [],
  ): HumanTask {
    return this.actOnHumanTask(humanTaskId, actor, { kind: 'complete', fields, evidenceRefs })
  }

  dispatch(caseId: string, actor: Role): CaseView {
    const attemptDispatch = this.database.transaction(() => {
      const stored = this.requireCase(caseId)
      if (stored.orderStatus === 'DISPATCHED') return
      const confirmation = this.repository
        .listHumanTasks({ caseId, status: 'OPEN' })
        .find((task) => task.ruleId === dispatchConfirmationRuleId)
      if (!confirmation) {
        throw new CoordinatorError('NOT_READY_TO_DISPATCH', 'no dispatcher confirmation is pending')
      }
      this.applyCommand(confirmation, { kind: 'approve', actor })
      const finalGateStatus = this.evaluateAndPersist(caseId)
      if (finalGateStatus !== 'PASS') {
        throw new CoordinatorError('NOT_READY_TO_DISPATCH', `R40 is ${finalGateStatus}`, {
          finalGateStatus,
        })
      }
      this.repository.updateOrderStatus(caseId, 'DISPATCHED', this.now())
    })
    attemptDispatch.immediate()
    return this.getCase(caseId)
  }

  private actOnHumanTask(humanTaskId: string, actor: Role, action: HumanTaskAction): HumanTask {
    const act = this.database.transaction(() => {
      const task = this.repository.findHumanTask(humanTaskId)
      if (!task) throw new CoordinatorError('NOT_FOUND', `human task ${humanTaskId} not found`)
      if (task.ruleId === dispatchConfirmationRuleId) {
        throw new CoordinatorError('CONFLICT', 'dispatcher confirmation goes through dispatch')
      }
      const updated = this.applyCommand(task, { ...action, actor } as HumanTaskCommand)
      this.evaluateAndPersist(task.caseId)
      return updated
    })
    return act.immediate()
  }

  private applyCommand(task: HumanTask, command: HumanTaskCommand): HumanTask {
    const stored = this.requireCase(task.caseId)
    const rule = this.requireRule(task.ruleId)
    const entityId = this.entityIdOfTask(task)
    const result = applyHumanTaskCommand(task, command, {
      now: this.now() as UtcTimestamp,
      currentTarget: this.targetFor(rule, stored.shipment),
    })
    this.repository.saveHumanTask(result.task, entityId)
    if (!result.accepted) {
      const code =
        result.reason === 'UNAUTHORIZED_ROLE'
          ? 'FORBIDDEN'
          : result.reason === 'MISSING_EVIDENCE' || result.reason === 'WRONG_TASK_TYPE'
            ? 'UNPROCESSABLE'
            : 'CONFLICT'
      throw new CoordinatorError(code, `human task ${task.humanTaskId}: ${result.reason}`, {
        reason: result.reason,
      })
    }
    return result.task
  }

  private evaluateAndPersist(caseId: string) {
    const stored = this.requireCase(caseId)
    const { shipment } = stored
    const now = this.now()
    const inputs = this.evaluationInputsFor(stored, now)
    const graph = evaluateRuleGraph({
      rulesInEvaluationOrder: this.configuration.rulesInEvaluationOrder,
      subjects: {
        cargoItem: shipment.cargoItems.map((item) => item.cargoItemId),
        leg: shipment.legs.map((leg) => leg.legId),
      },
      evaluateLeaf: (rule, subject) => evaluateLeafRule(rule, subject, inputs),
    })

    this.repository.replaceCheckResults(caseId, this.toCheckResults(stored, graph.evaluations, now))
    const finalGateStatus = graph.statusOf(finalGateRuleId)
    const orderStatus = deriveOrderStatus({
      evaluations: graph.evaluations,
      finalGateStatus,
      openHumanTasks: this.repository.listHumanTasks({ caseId, status: 'OPEN' }),
    })
    this.repository.updateOrderStatus(caseId, orderStatus, now)
    return finalGateStatus
  }

  private evaluationInputsFor(stored: StoredCase, now: string): EvaluationInputs {
    const { caseId, shipment } = stored
    return {
      shipment,
      storedVersions: {
        caseRevision: shipment.caseRevision,
        entityVersions: shipment.entityVersions,
      },
      referenceData: this.referenceData,
      policy: this.configuration.policy,
      semanticAnswerFor: (ruleId, entityId) =>
        this.repository.findSemanticAnswer(caseId, ruleId, entityId),
      humanGateStatus: (rule, subject) => this.resolveHumanGate(stored, rule, subject, now),
      preloadHumanTasksStatus: () =>
        this.repository
          .listHumanTasks({ caseId, status: 'OPEN' })
          .some((task) => preloadGateRuleIds.has(task.ruleId))
          ? 'WAITING_HUMAN'
          : 'PASS',
      ensurePlanReservation: () => {
        const routeVersion = shipment.entityVersions.route
        executeOnce(
          this.database,
          {
            operationId: `${caseId}:route-v${routeVersion}:reserve_transport`,
            actionType: 'reserve_transport',
            request: { legs: shipment.legs.map((leg) => leg.legId) },
          },
          () =>
            shipment.legs.map((leg) =>
              this.repository.insertReservation(caseId, routeVersion, leg),
            ),
        )
        return this.repository.countReservations(caseId, routeVersion) === shipment.legs.length
      },
    }
  }

  private resolveHumanGate(
    stored: StoredCase,
    rule: RuleDefinition,
    subject: CheckSubject,
    now: string,
  ) {
    const target = this.targetFor(rule, stored.shipment)
    const tasks = this.repository
      .listHumanTasksForGate(stored.caseId, rule.ruleId, subject.entityId)
      .map((task) => this.persistIfExpired(task, subject.entityId, now))
    const status = humanGateStatus(tasks, target, now as UtcTimestamp)
    if (status !== 'UNKNOWN') return status

    const staleOpenTask = tasks.find(
      (task) => task.status === 'OPEN' && !targetsMatch(task.target, target),
    )
    const replacementFields = {
      humanTaskId: this.nextHumanTaskId(stored.caseId, rule.ruleId),
      target,
      createdAt: now as UtcTimestamp,
      expiresAt: minutesFrom(now, this.taskTtlMinutes(rule)) as UtcTimestamp,
    }
    if (staleOpenTask) {
      const { superseded, replacement } = supersedeForNewTarget(staleOpenTask, replacementFields)
      this.repository.saveHumanTask(superseded, subject.entityId)
      this.repository.saveHumanTask(replacement, subject.entityId)
    } else {
      this.repository.saveHumanTask(
        createHumanTask({
          ...replacementFields,
          caseId: stored.caseId as never,
          ruleId: rule.ruleId,
          taskType: rule.humanGate?.taskType ?? 'APPROVAL',
          requiredRole: rule.humanGate?.requiredRole ?? 'DISPATCHER',
          prerequisites: rule.dependsOn,
          requiredEvidenceFields:
            rule.humanGate?.taskType === 'OPERATION' ? this.evidenceFieldsFor(rule) : [],
        }),
        subject.entityId,
      )
    }
    return 'WAITING_HUMAN'
  }

  private evidenceFieldsFor(rule: RuleDefinition): string[] {
    return rule.ruleId === 'R39-LOAD' ? ['loadScanRef', 'physicalCheckBy'] : ['evidenceRef']
  }

  private taskTtlMinutes(rule: RuleDefinition): number {
    const parameter =
      rule.humanGate?.taskType === 'OPERATION'
        ? 'operationTaskTtlMinutes'
        : 'approvalTaskTtlMinutes'
    return Number(this.configuration.policy[parameter])
  }

  private persistIfExpired(task: HumanTask, entityId: string, now: string): HumanTask {
    const current = expireIfDue(task, now as UtcTimestamp)
    if (current !== task) this.repository.saveHumanTask(current, entityId)
    return current
  }

  private targetFor(rule: RuleDefinition, shipment: Shipment): HumanTaskTarget {
    return {
      caseRevision: shipment.caseRevision,
      entityVersions: shipment.entityVersions,
      inputFingerprint: computeInputFingerprint({
        document: shipment,
        inputPaths: rule.inputPaths,
        entityVersions: shipment.entityVersions,
        upstreamResultIds: [],
      }),
    }
  }

  private toCheckResults(
    stored: StoredCase,
    evaluations: readonly RuleEvaluation[],
    now: string,
  ): CheckResult[] {
    const { shipment } = stored
    const checkResultIdOf = (evaluation: Pick<RuleEvaluation, 'ruleId' | 'subject'>) =>
      `${stored.caseId}:r${shipment.caseRevision}:${subjectKey(evaluation.ruleId, evaluation.subject)}` as CheckResultId
    const evaluationsByRule = Map.groupBy(evaluations, (evaluation) => evaluation.ruleId as string)

    return evaluations.map((evaluation) => {
      const rule = this.requireRule(evaluation.ruleId)
      const dependsOnResultIds = upstreamRuleIds(rule)
        .flatMap((upstreamRuleId) => evaluationsByRule.get(upstreamRuleId) ?? [])
        .filter(
          (upstream) =>
            upstream.subject.scope === 'order' ||
            upstream.subject.scope !== evaluation.subject.scope ||
            upstream.subject.entityId === evaluation.subject.entityId,
        )
        .map(checkResultIdOf)
      return {
        checkResultId: checkResultIdOf(evaluation),
        ruleId: evaluation.ruleId,
        ruleVersion: rule.version,
        subject: evaluation.subject,
        caseRevision: shipment.caseRevision,
        observedValue: evaluation.observedValue,
        gateStatus: evaluation.gateStatus,
        blockedBy: evaluation.blockedBy,
        dependsOnResultIds,
        inputFingerprint: computeInputFingerprint({
          document: shipment,
          inputPaths: rule.inputPaths,
          entityVersions: shipment.entityVersions,
          upstreamResultIds: dependsOnResultIds,
        }),
        engine: rule.evaluator.kind,
        evidenceRefs: [],
        producedAt: now as UtcTimestamp,
      }
    })
  }

  private nextHumanTaskId(caseId: string, ruleId: string): HumanTaskId {
    return `HT-${caseId}-${ruleId}-${this.repository.countHumanTasks(caseId) + 1}` as HumanTaskId
  }

  private entityIdOfTask(task: HumanTask): string {
    return this.repository.findHumanTaskEntityId(task.humanTaskId) ?? 'order'
  }

  private requireCase(caseId: string): StoredCase {
    const stored = this.repository.findCase(caseId)
    if (!stored) throw new CoordinatorError('NOT_FOUND', `case ${caseId} not found`)
    return stored
  }

  private requireRule(ruleId: RuleId | string): RuleDefinition {
    const rule = this.rulesById.get(ruleId)
    if (!rule) throw new CoordinatorError('NOT_FOUND', `rule ${ruleId} not found`)
    return rule
  }
}
