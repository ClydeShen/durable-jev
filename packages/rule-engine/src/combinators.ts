import { type CheckStatus, isPendingCheckStatus, type RuleId } from '@durable-jev/contracts'

export interface Outcome {
  status: CheckStatus
  blockedBy: RuleId[]
}

export const outcome = (status: CheckStatus, blockedBy: RuleId[] = []): Outcome => ({
  status,
  blockedBy,
})

function blockersOf(outcomes: readonly Outcome[]): RuleId[] {
  return [...new Set(outcomes.flatMap((child) => child.blockedBy))]
}

function applicable(outcomes: readonly Outcome[]): Outcome[] {
  return outcomes.filter((child) => child.status !== 'NOT_APPLICABLE')
}

function firstWith(outcomes: readonly Outcome[], status: CheckStatus): Outcome | undefined {
  return outcomes.find((child) => child.status === status)
}

function firstUnresolved(outcomes: readonly Outcome[]): Outcome | undefined {
  return outcomes.find((child) => child.status === 'ERROR' || isPendingCheckStatus(child.status))
}

export function combineAnd(children: readonly Outcome[]): Outcome {
  const relevant = applicable(children)
  if (relevant.length === 0) return outcome('NOT_APPLICABLE')
  if (firstWith(relevant, 'FAIL')) return outcome('FAIL')
  if (firstWith(relevant, 'ERROR')) return outcome('ERROR')
  const pending = relevant.find((child) => isPendingCheckStatus(child.status))
  if (pending) return outcome(pending.status, blockersOf(relevant))
  return outcome('PASS')
}

export function combineOr(children: readonly Outcome[]): Outcome {
  const relevant = applicable(children)
  if (relevant.length === 0) return outcome('NOT_APPLICABLE')
  if (firstWith(relevant, 'PASS')) return outcome('PASS')
  const unresolved = firstUnresolved(relevant)
  if (unresolved) return outcome(unresolved.status, blockersOf(relevant))
  return outcome('FAIL')
}

export function negate(child: Outcome): Outcome {
  if (child.status === 'PASS') return outcome('FAIL')
  if (child.status === 'FAIL') return outcome('PASS')
  return child
}

export function combineIfThen(condition: Outcome, evaluateConsequence: () => Outcome): Outcome {
  if (condition.status === 'PASS') return evaluateConsequence()
  if (condition.status === 'FAIL' || condition.status === 'NOT_APPLICABLE') {
    return outcome('NOT_APPLICABLE')
  }
  if (condition.status === 'ERROR') return outcome('ERROR')
  return outcome('BLOCKED_DEPENDENCY', condition.blockedBy)
}

export function combineAllOf(members: readonly Outcome[]): Outcome {
  return members.length === 0 ? outcome('UNKNOWN') : combineAnd(members)
}

export function combineAnyOf(members: readonly Outcome[]): Outcome {
  return members.length === 0 ? outcome('UNKNOWN') : combineOr(members)
}
