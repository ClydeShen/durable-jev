import { type GateStatus, isPendingGateStatus } from '@durable-jev/contracts'

function withoutNotApplicable(statuses: readonly GateStatus[]): GateStatus[] {
  return statuses.filter((status) => status !== 'NOT_APPLICABLE')
}

export function combineAnd(statuses: readonly GateStatus[]): GateStatus {
  const relevant = withoutNotApplicable(statuses)
  if (relevant.length === 0) return 'NOT_APPLICABLE'
  if (relevant.includes('FAIL')) return 'FAIL'
  if (relevant.includes('ERROR')) return 'ERROR'
  return relevant.find(isPendingGateStatus) ?? 'PASS'
}

export function combineOr(statuses: readonly GateStatus[]): GateStatus {
  const relevant = withoutNotApplicable(statuses)
  if (relevant.length === 0) return 'NOT_APPLICABLE'
  if (relevant.includes('PASS')) return 'PASS'
  return relevant.find((status) => status !== 'FAIL') ?? 'FAIL'
}

export function combineNot(status: GateStatus): GateStatus {
  if (status === 'PASS') return 'FAIL'
  if (status === 'FAIL') return 'PASS'
  return status
}

export function combineIfThen(
  condition: GateStatus,
  evaluateConsequence: () => GateStatus,
): GateStatus {
  if (condition === 'PASS') return evaluateConsequence()
  if (condition === 'FAIL' || condition === 'NOT_APPLICABLE') return 'NOT_APPLICABLE'
  if (condition === 'ERROR') return 'ERROR'
  return 'BLOCKED_DEPENDENCY'
}

export function combineAllOf(memberStatuses: readonly GateStatus[]): GateStatus {
  if (memberStatuses.length === 0) return 'UNKNOWN'
  return combineAnd(memberStatuses)
}

export function combineAnyOf(memberStatuses: readonly GateStatus[]): GateStatus {
  if (memberStatuses.length === 0) return 'UNKNOWN'
  return combineOr(memberStatuses)
}
