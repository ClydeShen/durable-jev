import type { GateStatus, OrderStatus } from '@durable-jev/contracts'

const labels: Record<string, string> = {
  PASS: '通过',
  FAIL: '不通过',
  UNKNOWN: '未知',
  NOT_APPLICABLE: '不适用',
  ERROR: '错误',
  BLOCKED_DEPENDENCY: '前置阻塞',
  WAITING_HUMAN: '等待人工',
  INVALIDATED: '已失效',
  SUBMITTED: '已提交',
  EVALUATING: '评估中',
  ON_HOLD: '暂停',
  AWAITING_HUMAN: '等待人工',
  READY_TO_DISPATCH: '可发运',
  DISPATCHED: '已发运',
  REJECTED: '已拒绝',
  TECHNICAL_FAILURE: '技术故障',
}

export function StatusBadge({ status }: { status: GateStatus | OrderStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`} title={status}>
      {labels[status] ?? status}
    </span>
  )
}
