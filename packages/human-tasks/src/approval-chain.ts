import type { ApprovalMode, CheckStatus, HumanTask } from '@durable-jev/contracts'

export interface ChainShape {
  chainId: string
  mode: ApprovalMode
  stepCount: number
}

export type ChainOutcome =
  | { status: 'APPROVED' }
  | { status: 'REJECTED'; stepIndex: number }
  | { status: 'EXPIRED'; stepIndex: number }
  | { status: 'ENDED'; reason: 'CANCELLED' | 'SUPERSEDED' }
  | { status: 'PENDING'; waitingOn: number[] }

function activeTasks(chain: ChainShape, tasks: readonly HumanTask[]): Map<number, HumanTask> {
  const byStep = new Map<number, HumanTask>()
  for (const task of tasks) {
    const step = task.approvalChain
    if (step?.chainId === chain.chainId) byStep.set(step.stepIndex, task)
  }
  return byStep
}

export function chainOutcome(chain: ChainShape, tasks: readonly HumanTask[]): ChainOutcome {
  const byStep = activeTasks(chain, tasks)
  const steps = [...byStep.entries()].sort(([left], [right]) => left - right)
  const rejected = steps.find(([, task]) => task.status === 'REJECTED')
  if (rejected) return { status: 'REJECTED', stepIndex: rejected[0] }
  const expired = steps.find(([, task]) => task.status === 'EXPIRED')
  if (expired) return { status: 'EXPIRED', stepIndex: expired[0] }
  const ended = steps.find(
    ([, task]) => task.status === 'CANCELLED' || task.status === 'SUPERSEDED',
  )
  if (ended) return { status: 'ENDED', reason: ended[1].status as 'CANCELLED' | 'SUPERSEDED' }
  const approved = steps.filter(([, task]) => task.status === 'APPROVED').length
  if (approved === chain.stepCount) return { status: 'APPROVED' }
  const waitingOn = Array.from({ length: chain.stepCount }, (_, index) => index).filter(
    (index) => byStep.get(index)?.status !== 'APPROVED',
  )
  return { status: 'PENDING', waitingOn }
}

export function stepsToOpen(chain: ChainShape, tasks: readonly HumanTask[]): number[] {
  if (chainOutcome(chain, tasks).status !== 'PENDING') return []
  const byStep = activeTasks(chain, tasks)
  const missing = Array.from({ length: chain.stepCount }, (_, index) => index).filter(
    (index) => !byStep.has(index),
  )
  if (chain.mode === 'parallel') return missing
  const next = missing[0]
  if (next === undefined) return []
  const earlierApproved = Array.from(
    { length: next },
    (_, index) => byStep.get(index)?.status,
  ).every((status) => status === 'APPROVED')
  return earlierApproved ? [next] : []
}

export function gateStatusOf(outcome: ChainOutcome): CheckStatus {
  switch (outcome.status) {
    case 'APPROVED':
      return 'PASS'
    case 'REJECTED':
      return 'FAIL'
    case 'PENDING':
      return 'WAITING_HUMAN'
    case 'EXPIRED':
    case 'ENDED':
      return 'UNKNOWN'
  }
}
