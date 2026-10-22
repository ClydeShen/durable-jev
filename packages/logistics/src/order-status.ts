import type { CaseView } from '@durable-jev/agent-core'
import type { OrderStatus, Role } from '@durable-jev/contracts'

export function orderStatusOf(view: CaseView): OrderStatus {
  if (view.record.dispatchedAt) return 'DISPATCHED'
  const release = view.outcomes.find((outcome) => outcome.ruleId === 'R40')
  switch (release?.status) {
    case undefined:
      return 'EVALUATING'
    case 'PASS':
      return 'READY_TO_DISPATCH'
    case 'WAITING_HUMAN':
      return 'AWAITING_HUMAN'
    case 'ERROR':
      return 'TECHNICAL_FAILURE'
    default:
      return 'ON_HOLD'
  }
}

export function rolesWaitedOn(view: CaseView): Role[] {
  return [
    ...new Set(
      view.tasks.filter((task) => task.status === 'OPEN').map((task) => task.requiredRole),
    ),
  ]
}
