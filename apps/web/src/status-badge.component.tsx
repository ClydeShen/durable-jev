import type { GateStatus, HumanTaskStatus, OrderStatus } from '@durable-jev/contracts'
import { Icon, iconForStatus } from './icons.component.js'

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

export const StatusBadge = ({ status }: { status: GateStatus | OrderStatus | HumanTaskStatus }) => {
  const icon = iconForStatus(status)
  return (
    <span className={`badge badge-${status.toLowerCase()}`} title={status}>
      {icon && <Icon name={icon} size={12} />}
      {labels[status] ?? status}
    </span>
  )
}
