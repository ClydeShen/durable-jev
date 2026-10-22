import type { ApprovalMode, CheckStatus, HumanTask } from '@durable-jev/contracts'

export interface ChainShape {
  mode: ApprovalMode
  stepCount: number
}

export type ChainSteps = ReadonlyMap<number, HumanTask>

export type ChainOutcome =
  | { status: 'DONE' }
  | { status: 'REJECTED'; stepIndex: number }
  | { status: 'EXPIRED'; stepIndex: number }
  | { status: 'ENDED'; reason: 'CANCELLED' | 'SUPERSEDED' }
  | { status: 'PENDING'; waitingOn: number[] }

const isDone = (task: HumanTask | undefined) =>
  task?.status === 'APPROVED' || task?.status === 'COMPLETED'

const stepIndexes = (chain: ChainShape) =>
  Array.from({ length: chain.stepCount }, (_, index) => index)

function firstStepWith(steps: ChainSteps, statuses: readonly HumanTask['status'][]) {
  return [...steps.entries()]
    .sort(([left], [right]) => left - right)
    .find(([, task]) => statuses.includes(task.status))
}

export function chainOutcome(chain: ChainShape, steps: ChainSteps): ChainOutcome {
  const rejected = firstStepWith(steps, ['REJECTED'])
  if (rejected) return { status: 'REJECTED', stepIndex: rejected[0] }
  const expired = firstStepWith(steps, ['EXPIRED'])
  if (expired) return { status: 'EXPIRED', stepIndex: expired[0] }
  const ended = firstStepWith(steps, ['CANCELLED', 'SUPERSEDED'])
  if (ended) return { status: 'ENDED', reason: ended[1].status as 'CANCELLED' | 'SUPERSEDED' }
  const waitingOn = stepIndexes(chain).filter((index) => !isDone(steps.get(index)))
  return waitingOn.length === 0 ? { status: 'DONE' } : { status: 'PENDING', waitingOn }
}

export function stepsToOpen(chain: ChainShape, steps: ChainSteps): number[] {
  if (chainOutcome(chain, steps).status !== 'PENDING') return []
  const missing = stepIndexes(chain).filter((index) => !steps.has(index))
  if (chain.mode === 'parallel') return missing
  const next = missing[0]
  if (next === undefined) return []
  return stepIndexes({ ...chain, stepCount: next }).every((index) => isDone(steps.get(index)))
    ? [next]
    : []
}

export function gateStatusOf(outcome: ChainOutcome): CheckStatus {
  switch (outcome.status) {
    case 'DONE':
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
