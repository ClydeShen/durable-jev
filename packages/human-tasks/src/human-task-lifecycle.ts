import type {
  CaseId,
  EvidenceRef,
  GateStatus,
  HumanTask,
  HumanTaskId,
  HumanTaskTarget,
  HumanTaskType,
  Role,
  RuleId,
  UtcTimestamp,
} from '@durable-jev/contracts'

export type NewHumanTask = {
  humanTaskId: HumanTaskId
  caseId: CaseId
  ruleId: RuleId
  taskType: HumanTaskType
  requiredRole: Role
  target: HumanTaskTarget
  prerequisites: RuleId[]
  requiredEvidenceFields: string[]
  createdAt: UtcTimestamp
  expiresAt: UtcTimestamp
}

export function createHumanTask(task: NewHumanTask): HumanTask {
  return { ...task, status: 'OPEN' }
}

export type HumanTaskCommand =
  | { kind: 'approve'; actor: Role; reason?: string }
  | { kind: 'reject'; actor: Role; reason: string }
  | {
      kind: 'complete'
      actor: Role
      fields: Record<string, string>
      evidenceRefs: EvidenceRef[]
    }
  | { kind: 'cancel' }

export type HumanTaskRejection =
  | 'TASK_NOT_OPEN'
  | 'EXPIRED'
  | 'UNAUTHORIZED_ROLE'
  | 'STALE_TARGET'
  | 'WRONG_TASK_TYPE'
  | 'MISSING_EVIDENCE'

export type HumanTaskCommandResult =
  | { accepted: true; task: HumanTask }
  | { accepted: false; reason: HumanTaskRejection; task: HumanTask }

export type HumanTaskCommandContext = {
  now: UtcTimestamp
  currentTarget: HumanTaskTarget
}

export function applyHumanTaskCommand(
  task: HumanTask,
  command: HumanTaskCommand,
  context: HumanTaskCommandContext,
): HumanTaskCommandResult {
  if (task.status !== 'OPEN') return rejected(task, 'TASK_NOT_OPEN')
  if (command.kind === 'cancel') return accepted({ ...task, status: 'CANCELLED' })

  if (isExpired(task, context.now)) return rejected({ ...task, status: 'EXPIRED' }, 'EXPIRED')
  if (command.actor !== task.requiredRole) return rejected(task, 'UNAUTHORIZED_ROLE')
  if (!targetsMatch(task.target, context.currentTarget)) return rejected(task, 'STALE_TARGET')

  if (command.kind === 'complete') {
    if (task.taskType !== 'OPERATION') return rejected(task, 'WRONG_TASK_TYPE')
    const missingField = task.requiredEvidenceFields.some((field) => !command.fields[field]?.trim())
    if (missingField) return rejected(task, 'MISSING_EVIDENCE')
    return accepted({
      ...task,
      status: 'COMPLETED',
      actionEvidence: {
        completedBy: command.actor,
        completedAt: context.now,
        fields: command.fields,
        evidenceRefs: command.evidenceRefs,
      },
    })
  }

  if (task.taskType !== 'APPROVAL') return rejected(task, 'WRONG_TASK_TYPE')
  const outcome = command.kind === 'approve' ? 'APPROVED' : 'REJECTED'
  return accepted({
    ...task,
    status: outcome,
    decision: {
      outcome,
      decidedBy: command.actor,
      decidedAt: context.now,
      ...(command.reason === undefined ? {} : { reason: command.reason }),
    },
  })
}

export function expireIfDue(task: HumanTask, now: UtcTimestamp): HumanTask {
  return task.status === 'OPEN' && isExpired(task, now) ? { ...task, status: 'EXPIRED' } : task
}

export function supersedeForNewTarget(
  task: HumanTask,
  replacement: Pick<NewHumanTask, 'humanTaskId' | 'target' | 'createdAt' | 'expiresAt'>,
): { superseded: HumanTask; replacement: HumanTask } {
  return {
    superseded: { ...task, status: 'SUPERSEDED', supersededBy: replacement.humanTaskId },
    replacement: createHumanTask({
      humanTaskId: replacement.humanTaskId,
      caseId: task.caseId,
      ruleId: task.ruleId,
      taskType: task.taskType,
      requiredRole: task.requiredRole,
      target: replacement.target,
      prerequisites: task.prerequisites,
      requiredEvidenceFields: task.requiredEvidenceFields,
      createdAt: replacement.createdAt,
      expiresAt: replacement.expiresAt,
    }),
  }
}

export function humanGateStatus(
  tasks: readonly HumanTask[],
  currentTarget: HumanTaskTarget,
  now: UtcTimestamp,
): GateStatus {
  const current = tasks
    .map((task) => expireIfDue(task, now))
    .filter((task) => targetsMatch(task.target, currentTarget))
  if (current.some((task) => task.status === 'APPROVED' || task.status === 'COMPLETED')) {
    return 'PASS'
  }
  if (current.some((task) => task.status === 'REJECTED')) return 'FAIL'
  if (current.some((task) => task.status === 'OPEN')) return 'WAITING_HUMAN'
  return 'UNKNOWN'
}

export function targetsMatch(left: HumanTaskTarget, right: HumanTaskTarget): boolean {
  return (
    left.caseRevision === right.caseRevision && left.inputFingerprint === right.inputFingerprint
  )
}

function isExpired(task: HumanTask, now: UtcTimestamp): boolean {
  return Date.parse(now) >= Date.parse(task.expiresAt)
}

function accepted(task: HumanTask): HumanTaskCommandResult {
  return { accepted: true, task }
}

function rejected(task: HumanTask, reason: HumanTaskRejection): HumanTaskCommandResult {
  return { accepted: false, reason, task }
}
