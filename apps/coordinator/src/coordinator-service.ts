import { BranchUnavailableError } from '@durable-jev/branch-service'
import type {
  CaseChange,
  CaseEvidence,
  CheckResult,
  CheckResultId,
  EvidenceRef,
  GateStatus,
  HumanGateRequest,
  HumanGateState,
  HumanTask,
  HumanTaskId,
  HumanTaskTarget,
  OrderStatus,
  PlanChange,
  Role,
  RuleEvaluationRecord,
  RuleId,
  ScriptedSemanticAnswer,
  Shipment,
  UtcTimestamp,
} from '@durable-jev/contracts'
import { emptyCaseEvidence, orderStatusMachine } from '@durable-jev/contracts'
import {
  applyHumanTaskCommand,
  canBeSuperseded,
  createHumanTask,
  type DecisionCondition,
  expireIfDue,
  type HumanTaskCommand,
  humanGateStatus,
  supersedeTask,
  targetsMatch,
} from '@durable-jev/human-tasks'
import {
  computeInputFingerprint,
  invalidateDependentsOf,
  type RuleDefinition,
  relevantEntityVersions,
  subjectKey,
  upstreamRuleIds,
} from '@durable-jev/rule-engine'
import {
  humanGateRuleIds,
  type RuleConfiguration,
  requiredUpstreamRuleIds,
} from '@durable-jev/rule-evaluation'
import type { StoreDatabase } from '@durable-jev/store'
import { type BranchEvaluator, planEvaluationLayers } from './branch-evaluators.js'
import { CoordinatorError } from './coordinator-errors.js'
import { deriveOrderStatus, dispatchConfirmationRuleId, finalGateRuleId } from './order-status.js'
import { CoordinatorRepository, type StoredCase } from './persistence/coordinator-repository.js'
import { applyPlanChange, roleForChange } from './plan-change.js'

export type CoordinatorDependencies = {
  database: StoreDatabase
  configuration: RuleConfiguration
  evaluators: readonly BranchEvaluator[]
  now?: () => string
}

export type SubmitCaseRequest = {
  shipment: Shipment
  evidence?: CaseEvidence
  scriptedSemanticAnswers?: ScriptedSemanticAnswer[]
}

export type CaseView = StoredCase & {
  checks: CheckResult[]
  humanTasks: HumanTask[]
  changes: CaseChange[]
}

type HumanTaskAction =
  | { kind: 'approve'; reason?: string; conditions?: DecisionCondition[] }
  | { kind: 'reject'; reason: string }
  | { kind: 'complete'; fields: Record<string, string>; evidenceRefs: EvidenceRef[] }

type CaseEvaluation = {
  caseRevision: number
  evaluations: RuleEvaluationRecord[]
  humanGateRequests: HumanGateRequest[]
}

const minutesFrom = (timestamp: string, minutes: number) =>
  new Date(Date.parse(timestamp) + minutes * 60_000).toISOString()

const gateKey = (ruleId: string, entityId: string) => `${ruleId}@${entityId}`

export class CoordinatorService {
  private readonly repository: CoordinatorRepository
  private readonly database: StoreDatabase
  private readonly configuration: RuleConfiguration
  private readonly evaluationLayers: BranchEvaluator[][]
  private readonly now: () => string
  private readonly rulesById: Map<string, RuleDefinition>

  constructor(dependencies: CoordinatorDependencies) {
    this.database = dependencies.database
    this.repository = new CoordinatorRepository(dependencies.database)
    this.configuration = dependencies.configuration
    this.evaluationLayers = planEvaluationLayers(
      dependencies.evaluators,
      dependencies.configuration,
    )
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.rulesById = new Map(
      dependencies.configuration.rulesInEvaluationOrder.map((rule) => [rule.ruleId, rule]),
    )
  }

  async submitCase(request: SubmitCaseRequest): Promise<CaseView> {
    const caseId = request.shipment.caseId
    const isNew = this.database
      .transaction(() => {
        if (this.repository.findCase(caseId)) return false
        const now = this.now()
        this.repository.insertCase({
          caseId,
          correlationId: `corr-${caseId}`,
          shipment: request.shipment,
          evidence: request.evidence ?? emptyCaseEvidence,
          orderStatus: orderStatusMachine.initial,
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
        return true
      })
      .immediate()
    if (isNew) await this.reevaluate(caseId)
    return this.getCase(caseId)
  }

  async reevaluate(caseId: string): Promise<CaseView> {
    const stored = this.requireCase(caseId)
    if (orderStatusMachine.isTerminal(stored.orderStatus)) return this.getCase(caseId)
    const evaluation = await this.evaluateCase(stored)
    this.database.transaction(() => this.commitEvaluation(caseId, evaluation)).immediate()
    return this.getCase(caseId)
  }

  getCase(caseId: string): CaseView {
    const stored = this.requireCase(caseId)
    return {
      ...stored,
      checks: this.repository.listCheckResults(caseId),
      humanTasks: this.repository.listHumanTasks({ caseId }),
      changes: this.repository.listChanges(caseId),
    }
  }

  async applyChange(caseId: string, change: PlanChange, actor: Role): Promise<CaseView> {
    this.database
      .transaction(() => {
        const stored = this.requireActiveCase(caseId)
        if (actor !== roleForChange[change.kind]) {
          throw new CoordinatorError(
            'FORBIDDEN',
            `${change.kind} requires ${roleForChange[change.kind]}`,
          )
        }
        const applied = applyPlanChange(stored.shipment, change)
        const changeId = `CHG-${caseId}-r${applied.shipment.caseRevision}`
        const invalidated = invalidateDependentsOf(this.configuration.rulesInEvaluationOrder, {
          changeId,
          triggers: applied.triggers,
        })
        const now = this.now()
        this.repository.insertChange({
          changeId,
          caseId: caseId as never,
          fromRevision: stored.shipment.caseRevision,
          toRevision: applied.shipment.caseRevision,
          change,
          triggers: applied.triggers,
          invalidatedRuleIds: [...invalidated],
          requestedBy: actor,
          requestedAt: now as UtcTimestamp,
        })
        this.repository.updateShipment(caseId, applied.shipment, now)
        this.repository.replaceCheckResults(
          caseId,
          this.repository
            .listCheckResults(caseId)
            .map((check) =>
              invalidated.has(check.ruleId)
                ? { ...check, gateStatus: 'INVALIDATED', invalidatedByChange: changeId }
                : check,
            ),
        )
        this.moveOrderTo(caseId, 'EVALUATING')
      })
      .immediate()
    return this.reevaluate(caseId)
  }

  listRules(): { ruleSetVersion: string; rules: RuleDefinition[] } {
    return {
      ruleSetVersion: this.configuration.ruleSetVersion,
      rules: this.configuration.rulesInEvaluationOrder,
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

  approveHumanTask(
    humanTaskId: string,
    actor: Role,
    reason?: string,
    conditions?: DecisionCondition[],
  ): Promise<HumanTask> {
    return this.actOnHumanTask(humanTaskId, actor, {
      kind: 'approve',
      ...(reason === undefined ? {} : { reason }),
      ...(conditions === undefined ? {} : { conditions }),
    })
  }

  rejectHumanTask(humanTaskId: string, actor: Role, reason: string): Promise<HumanTask> {
    return this.actOnHumanTask(humanTaskId, actor, { kind: 'reject', reason })
  }

  completeHumanTask(
    humanTaskId: string,
    actor: Role,
    fields: Record<string, string>,
    evidenceRefs: EvidenceRef[] = [],
  ): Promise<HumanTask> {
    return this.actOnHumanTask(humanTaskId, actor, { kind: 'complete', fields, evidenceRefs })
  }

  async dispatch(caseId: string, actor: Role): Promise<CaseView> {
    const stored = this.requireCase(caseId)
    if (stored.orderStatus === 'DISPATCHED') return this.getCase(caseId)
    this.requireActiveCase(caseId)
    const confirmation = this.openDispatchConfirmation(caseId)
    this.assertCommandAccepted(confirmation, { kind: 'approve', actor })

    const confirmedGate: HumanGateState = {
      ruleId: dispatchConfirmationRuleId,
      entityId: 'order',
      status: 'PASS',
    }
    const evaluation = await this.evaluateCase(stored, [confirmedGate])

    this.database
      .transaction(() => {
        const current = this.requireActiveCase(caseId)
        const stillOpen = this.openDispatchConfirmation(caseId)
        if (
          current.shipment.caseRevision !== evaluation.caseRevision ||
          stillOpen.humanTaskId !== confirmation.humanTaskId
        ) {
          throw new CoordinatorError('CONFLICT', `case ${caseId} changed while dispatching`)
        }
        this.applyCommand(stillOpen, { kind: 'approve', actor })
        const finalGateStatus = this.commitEvaluation(caseId, evaluation)
        if (finalGateStatus !== 'PASS') {
          throw new CoordinatorError('NOT_READY_TO_DISPATCH', `R40 is ${finalGateStatus}`, {
            finalGateStatus,
          })
        }
        this.moveOrderTo(caseId, 'DISPATCHED')
      })
      .immediate()
    return this.getCase(caseId)
  }

  private async actOnHumanTask(
    humanTaskId: string,
    actor: Role,
    action: HumanTaskAction,
  ): Promise<HumanTask> {
    const updated = this.database
      .transaction(() => {
        const task = this.repository.findHumanTask(humanTaskId)
        if (!task) throw new CoordinatorError('NOT_FOUND', `human task ${humanTaskId} not found`)
        this.requireActiveCase(task.caseId)
        if (task.ruleId === dispatchConfirmationRuleId) {
          throw new CoordinatorError('CONFLICT', 'dispatcher confirmation goes through dispatch')
        }
        const allowedConditions = this.requireRule(task.ruleId).humanGate?.decisionConditions ?? []
        const unexpected = (action.kind === 'approve' ? (action.conditions ?? []) : []).filter(
          (condition) => !allowedConditions.includes(condition),
        )
        if (unexpected.length > 0) {
          throw new CoordinatorError(
            'UNPROCESSABLE',
            `${task.ruleId} does not accept ${unexpected.join(', ')}`,
          )
        }
        return this.applyCommand(task, { ...action, actor } as HumanTaskCommand)
      })
      .immediate()
    await this.reevaluate(updated.caseId)
    return updated
  }

  private openDispatchConfirmation(caseId: string): HumanTask {
    const confirmation = this.repository
      .listHumanTasks({ caseId, status: 'OPEN' })
      .find((task) => task.ruleId === dispatchConfirmationRuleId)
    if (!confirmation) {
      throw new CoordinatorError('NOT_READY_TO_DISPATCH', 'no dispatcher confirmation is pending')
    }
    return confirmation
  }

  private commandResult(task: HumanTask, command: HumanTaskCommand) {
    const stored = this.requireCase(task.caseId)
    return applyHumanTaskCommand(task, command, {
      now: this.now() as UtcTimestamp,
      currentTarget: this.targetFor(this.requireRule(task.ruleId), stored.shipment),
    })
  }

  private assertCommandAccepted(task: HumanTask, command: HumanTaskCommand): void {
    const result = this.commandResult(task, command)
    if (!result.accepted) throw this.rejectionError(task, result.reason)
  }

  private applyCommand(task: HumanTask, command: HumanTaskCommand): HumanTask {
    const result = this.commandResult(task, command)
    this.repository.saveHumanTask(result.task, this.entityIdOfTask(task))
    if (!result.accepted) throw this.rejectionError(task, result.reason)
    return result.task
  }

  private rejectionError(task: HumanTask, reason: string): CoordinatorError {
    const code =
      reason === 'UNAUTHORIZED_ROLE'
        ? 'FORBIDDEN'
        : reason === 'MISSING_EVIDENCE' || reason === 'WRONG_TASK_TYPE'
          ? 'UNPROCESSABLE'
          : 'CONFLICT'
    return new CoordinatorError(code, `human task ${task.humanTaskId}: ${reason}`, { reason })
  }

  private async evaluateCase(
    stored: StoredCase,
    gateOverrides: readonly HumanGateState[] = [],
  ): Promise<CaseEvaluation> {
    try {
      return await this.evaluateWithEvaluators(stored, gateOverrides)
    } catch (error) {
      if (error instanceof BranchUnavailableError) {
        this.database
          .transaction(() => {
            const current = this.requireCase(stored.caseId)
            if (!orderStatusMachine.isTerminal(current.orderStatus)) {
              this.moveOrderTo(stored.caseId, 'TECHNICAL_FAILURE')
            }
          })
          .immediate()
      }
      throw error
    }
  }

  private async evaluateWithEvaluators(
    stored: StoredCase,
    gateOverrides: readonly HumanGateState[],
  ): Promise<CaseEvaluation> {
    const overrides = new Map(
      gateOverrides.map((gate) => [gateKey(gate.ruleId, gate.entityId), gate]),
    )
    const evaluations: RuleEvaluationRecord[] = []
    const humanGateRequests: HumanGateRequest[] = []
    const semanticAnswers = this.repository.listSemanticAnswers(stored.caseId)
    for (const layer of this.evaluationLayers) {
      const results = await Promise.all(
        layer.map((evaluator) => {
          const needed = new Set(
            requiredUpstreamRuleIds(this.configuration.rulesInEvaluationOrder, evaluator.branches),
          )
          return evaluator.evaluate({
            caseId: stored.caseId as never,
            caseRevision: stored.shipment.caseRevision,
            shipment: stored.shipment,
            evidence: stored.evidence,
            semanticAnswers,
            upstreamResults: evaluations.filter((evaluation) => needed.has(evaluation.ruleId)),
            humanGates: this.humanGateStates(stored, evaluator, overrides),
          })
        }),
      )
      for (const result of results) {
        evaluations.push(...result.evaluations)
        humanGateRequests.push(...result.humanGateRequests)
      }
    }
    return { caseRevision: stored.shipment.caseRevision, evaluations, humanGateRequests }
  }

  private humanGateStates(
    stored: StoredCase,
    evaluator: BranchEvaluator,
    overrides: ReadonlyMap<string, HumanGateState>,
  ): HumanGateState[] {
    const now = this.now() as UtcTimestamp
    return humanGateRuleIds(this.configuration.rulesInEvaluationOrder, evaluator.branches).flatMap(
      (ruleId) => {
        const rule = this.requireRule(ruleId)
        const target = this.targetFor(rule, stored.shipment)
        return this.entityIdsInScope(rule, stored.shipment).map((entityId): HumanGateState => {
          const override = overrides.get(gateKey(ruleId, entityId))
          if (override) return override
          const tasks = this.repository
            .listHumanTasksForGate(stored.caseId, ruleId, entityId)
            .map((task) => expireIfDue(task, now))
          const current = tasks.filter((task) => targetsMatch(task.target, target))
          const decision = current.findLast((task) => task.decision)?.decision
          const completedFields = current.findLast((task) => task.status === 'COMPLETED')
            ?.actionEvidence?.fields
          return {
            ruleId: rule.ruleId,
            entityId,
            status: humanGateStatus(tasks, target, now),
            ...(decision === undefined ? {} : { decision }),
            ...(completedFields === undefined ? {} : { completedFields }),
          }
        })
      },
    )
  }

  private commitEvaluation(caseId: string, evaluation: CaseEvaluation): GateStatus | undefined {
    const stored = this.requireCase(caseId)
    if (orderStatusMachine.isTerminal(stored.orderStatus)) return undefined
    if (stored.shipment.caseRevision !== evaluation.caseRevision) {
      throw new CoordinatorError('CONFLICT', `case ${caseId} changed during evaluation`)
    }
    const now = this.now()
    this.expireDueTasks(caseId, now)
    for (const request of evaluation.humanGateRequests) {
      this.openTaskForGate(stored, this.requireRule(request.ruleId), request.entityId, now)
    }
    this.withdrawStaleOpenTasks(stored, now)
    const latestChange = this.repository
      .listChanges(caseId)
      .find((change) => change.toRevision === stored.shipment.caseRevision)
    this.repository.replaceCheckResults(
      caseId,
      this.toCheckResults(stored, evaluation.evaluations, now).map((check) =>
        latestChange?.invalidatedRuleIds.includes(check.ruleId)
          ? { ...check, affectedByChange: latestChange.changeId }
          : check,
      ),
    )
    const finalGateStatus =
      evaluation.evaluations.find((result) => result.ruleId === finalGateRuleId)?.gateStatus ??
      'UNKNOWN'
    const orderStatus = deriveOrderStatus({
      evaluations: evaluation.evaluations,
      finalGateStatus,
      openHumanTasks: this.repository.listHumanTasks({ caseId, status: 'OPEN' }),
    })
    this.moveOrderTo(caseId, orderStatus)
    return finalGateStatus
  }

  private expireDueTasks(caseId: string, now: string): void {
    for (const task of this.repository.listHumanTasks({ caseId, status: 'OPEN' })) {
      const current = expireIfDue(task, now as UtcTimestamp)
      if (current !== task) this.repository.saveHumanTask(current, this.entityIdOfTask(task))
    }
  }

  private withdrawStaleOpenTasks(stored: StoredCase, now: string): void {
    for (const task of this.repository.listHumanTasks({ caseId: stored.caseId, status: 'OPEN' })) {
      const target = this.targetFor(this.requireRule(task.ruleId), stored.shipment)
      if (targetsMatch(task.target, target)) continue
      const withdrawn = applyHumanTaskCommand(
        task,
        { kind: 'cancel' },
        {
          now: now as UtcTimestamp,
          currentTarget: target,
        },
      )
      this.repository.saveHumanTask(withdrawn.task, this.entityIdOfTask(task))
    }
  }

  private openTaskForGate(
    stored: StoredCase,
    rule: RuleDefinition,
    entityId: string,
    now: string,
  ): void {
    const target = this.targetFor(rule, stored.shipment)
    const tasks = this.repository.listHumanTasksForGate(stored.caseId, rule.ruleId, entityId)
    if (humanGateStatus(tasks, target, now as UtcTimestamp) !== 'UNKNOWN') return
    const replacement = createHumanTask({
      humanTaskId: this.nextHumanTaskId(stored.caseId, rule.ruleId),
      caseId: stored.caseId as never,
      ruleId: rule.ruleId,
      taskType: rule.humanGate?.taskType ?? 'APPROVAL',
      requiredRole: rule.humanGate?.requiredRole ?? 'DISPATCHER',
      target,
      prerequisites: rule.dependsOn,
      requiredEvidenceFields: rule.humanGate?.evidenceFields ?? [],
      createdAt: now as UtcTimestamp,
      expiresAt: minutesFrom(now, this.taskTtlMinutes(rule)) as UtcTimestamp,
    })
    this.repository.saveHumanTask(replacement, entityId)
    const staleTasks = tasks.filter(
      (task) => !targetsMatch(task.target, target) && canBeSuperseded(task),
    )
    for (const staleTask of staleTasks) {
      this.repository.saveHumanTask(supersedeTask(staleTask, replacement.humanTaskId), entityId)
    }
  }

  private entityIdsInScope(rule: RuleDefinition, shipment: Shipment): string[] {
    if (rule.scope === 'cargoItem') return shipment.cargoItems.map((item) => item.cargoItemId)
    if (rule.scope === 'leg') return shipment.legs.map((leg) => leg.legId)
    return ['order']
  }

  private taskTtlMinutes(rule: RuleDefinition): number {
    const parameter =
      rule.humanGate?.taskType === 'OPERATION'
        ? 'operationTaskTtlMinutes'
        : 'approvalTaskTtlMinutes'
    return Number(this.configuration.policy[parameter])
  }

  private targetFor(rule: RuleDefinition, shipment: Shipment): HumanTaskTarget {
    return {
      caseRevision: shipment.caseRevision,
      entityVersions: shipment.entityVersions,
      inputFingerprint: computeInputFingerprint({
        document: shipment,
        inputPaths: rule.inputPaths,
        entityVersions: relevantEntityVersions(rule.invalidationTriggers, shipment.entityVersions),
        upstreamResultIds: [],
      }),
    }
  }

  private toCheckResults(
    stored: StoredCase,
    evaluations: readonly RuleEvaluationRecord[],
    now: string,
  ): CheckResult[] {
    const { shipment } = stored
    const checkResultIdOf = (evaluation: Pick<RuleEvaluationRecord, 'ruleId' | 'subject'>) =>
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

  private moveOrderTo(caseId: string, next: OrderStatus): void {
    const stored = this.requireCase(caseId)
    const status = orderStatusMachine.transition(stored.orderStatus, next)
    if (status !== stored.orderStatus) {
      this.repository.updateOrderStatus(caseId, status, this.now())
    }
  }

  private requireActiveCase(caseId: string): StoredCase {
    const stored = this.requireCase(caseId)
    if (orderStatusMachine.isTerminal(stored.orderStatus)) {
      throw new CoordinatorError('CONFLICT', `case ${caseId} is ${stored.orderStatus}`)
    }
    return stored
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
