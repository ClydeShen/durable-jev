import type { GateStatus, HumanTaskStatus, OrderStatus } from '@durable-jev/contracts'

const labels: Record<string, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  UNKNOWN: 'Unknown',
  NOT_APPLICABLE: 'N/A',
  ERROR: 'Error',
  BLOCKED_DEPENDENCY: 'Blocked',
  WAITING_HUMAN: 'Awaiting human',
  INVALIDATED: 'Invalidated',
  SUBMITTED: 'Submitted',
  EVALUATING: 'Evaluating',
  ON_HOLD: 'On hold',
  AWAITING_HUMAN: 'Awaiting human',
  READY_TO_DISPATCH: 'Ready to dispatch',
  DISPATCHED: 'Dispatched',
  REJECTED: 'Rejected',
  TECHNICAL_FAILURE: 'Technical failure',
  OPEN: 'Open',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  SUPERSEDED: 'Superseded',
}

export function StatusBadge({ status }: { status: GateStatus | OrderStatus | HumanTaskStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`} title={status}>
      {labels[status] ?? status}
    </span>
  )
}
