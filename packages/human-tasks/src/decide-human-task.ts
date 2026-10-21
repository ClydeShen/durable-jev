import {
  canonicalJson,
  type HumanTask,
  type HumanTaskTarget,
  type Role,
} from '@durable-jev/contracts'

export interface Actor {
  id: string
  role: Role
}

export type HumanAction =
  | { type: 'approve' | 'reject'; actor: Actor; comment?: string }
  | {
      type: 'complete'
      actor: Actor
      fields: Record<string, unknown>
      evidenceRefs: string[]
    }
  | { type: 'expire' }
  | { type: 'cancel' }
  | { type: 'supersede'; by: string }

export interface ActionContext {
  now: string
  currentTarget: HumanTaskTarget
  chainTasks?: readonly HumanTask[]
}

export type RefusalReason =
  | 'NOT_FOUND'
  | 'NOT_OPEN'
  | 'UNAUTHORIZED'
  | 'EXPIRED'
  | 'NOT_EXPIRED'
  | 'STALE_TARGET'
  | 'WRONG_TASK_TYPE'
  | 'MISSING_EVIDENCE'
  | 'STEP_NOT_ACTIVE'
  | 'SAME_ACTOR'

export type Decision =
  | { ok: true; task: HumanTask }
  | { ok: false; reason: RefusalReason; message: string }

const refuse = (reason: RefusalReason, message: string): Decision => ({
  ok: false,
  reason,
  message,
})

function targetMatches(task: HumanTask, current: HumanTaskTarget): boolean {
  return canonicalJson(task.target) === canonicalJson(current)
}

function chainRefusal(
  task: HumanTask,
  actor: Actor,
  chainTasks: readonly HumanTask[],
): Decision | undefined {
  const chain = task.approvalChain
  if (!chain) return undefined
  const siblings = chainTasks.filter(
    (other) =>
      other.approvalChain?.chainId === chain.chainId && other.humanTaskId !== task.humanTaskId,
  )
  if (chain.mode === 'sequential') {
    const earlierApproved = siblings.filter(
      (other) =>
        (other.approvalChain?.stepIndex ?? 0) < chain.stepIndex && other.status === 'APPROVED',
    ).length
    if (earlierApproved < chain.stepIndex) {
      return refuse('STEP_NOT_ACTIVE', `step ${chain.stepIndex + 1} waits for earlier approvals`)
    }
  }
  if (chain.distinctActors && siblings.some((other) => other.decision?.decidedBy === actor.id)) {
    return refuse('SAME_ACTOR', `${actor.id} already decided another step of this chain`)
  }
  return undefined
}

function missingEvidence(task: HumanTask, fields: Record<string, unknown>): string[] {
  return task.evidenceRequirements.filter(
    (field) => fields[field] === undefined || fields[field] === '',
  )
}

function actorRefusal(task: HumanTask, actor: Actor, context: ActionContext): Decision | undefined {
  if (actor.role !== task.requiredRole) {
    return refuse('UNAUTHORIZED', `${actor.role} cannot act on a ${task.requiredRole} task`)
  }
  if (context.now >= task.expiresAt) return refuse('EXPIRED', `task expired at ${task.expiresAt}`)
  if (!targetMatches(task, context.currentTarget)) {
    return refuse('STALE_TARGET', 'the case changed since this task was created')
  }
  return undefined
}

export function decideHumanTask(
  task: HumanTask,
  action: HumanAction,
  context: ActionContext,
): Decision {
  if (action.type === 'supersede') {
    if (!['OPEN', 'APPROVED', 'COMPLETED'].includes(task.status)) {
      return refuse('NOT_OPEN', `a ${task.status} task cannot be superseded`)
    }
    return { ok: true, task: { ...task, status: 'SUPERSEDED', supersededBy: action.by } }
  }
  if (task.status !== 'OPEN') return refuse('NOT_OPEN', `task is ${task.status}`)
  if (action.type === 'cancel') return { ok: true, task: { ...task, status: 'CANCELLED' } }
  if (action.type === 'expire') {
    if (context.now < task.expiresAt)
      return refuse('NOT_EXPIRED', `task expires at ${task.expiresAt}`)
    return { ok: true, task: { ...task, status: 'EXPIRED' } }
  }
  const actorIssue = actorRefusal(task, action.actor, context)
  if (actorIssue) return actorIssue
  if (action.type === 'complete') {
    if (task.taskType !== 'OPERATION')
      return refuse('WRONG_TASK_TYPE', 'only operations are completed')
    const missing = missingEvidence(task, action.fields)
    if (missing.length > 0)
      return refuse('MISSING_EVIDENCE', `missing evidence: ${missing.join(', ')}`)
    return {
      ok: true,
      task: {
        ...task,
        status: 'COMPLETED',
        actionEvidence: {
          completedByRole: action.actor.role,
          completedBy: action.actor.id,
          completedAt: context.now,
          fields: action.fields,
          evidenceRefs: action.evidenceRefs,
        },
      },
    }
  }
  if (task.taskType !== 'APPROVAL') {
    return refuse('WRONG_TASK_TYPE', 'an approval cannot stand in for a field operation')
  }
  const chainIssue = chainRefusal(task, action.actor, context.chainTasks ?? [])
  if (chainIssue) return chainIssue
  const outcome = action.type === 'approve' ? 'APPROVED' : 'REJECTED'
  return {
    ok: true,
    task: {
      ...task,
      status: outcome,
      decision: {
        outcome,
        decidedByRole: action.actor.role,
        decidedBy: action.actor.id,
        decidedAt: context.now,
        ...(action.comment ? { comment: action.comment } : {}),
      },
    },
  }
}
