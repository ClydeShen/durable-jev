import type { CheckStatus, OrderStatus, Role, RuleEngineKind } from '@durable-jev/contracts'

export const roleLabels: Record<Role, string> = {
  transportPlanner: '运输计划员',
  complianceReviewer: '合规审核员',
  qualityReviewer: '质量审核员',
  commercialManager: '商务主管',
  warehouseOperator: '仓库操作员',
  dispatcher: '调度员',
  technicalEvaluator: '技术评估者',
}

export const checkStatusLabels: Record<CheckStatus, string> = {
  PASS: '通过',
  FAIL: '不通过',
  UNKNOWN: '未知',
  NOT_APPLICABLE: '不适用',
  ERROR: '错误',
  BLOCKED_DEPENDENCY: '被阻塞',
  WAITING_HUMAN: '等待人工',
  INVALIDATED: '已失效',
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  SUBMITTED: '已提交',
  EVALUATING: '评估中',
  ON_HOLD: '暂停',
  AWAITING_HUMAN: '等待人工',
  READY_TO_DISPATCH: '可发运',
  DISPATCHED: '已发运',
  REJECTED: '已拒绝',
  TECHNICAL_FAILURE: '技术故障',
}

export const kindLabels: Record<RuleEngineKind, string> = {
  expression: '表达式',
  code: '代码',
  decisionTable: '决策表',
  semantic: 'Jev',
  humanGate: '人工',
  combinator: '组合',
}

const severity: CheckStatus[] = [
  'ERROR',
  'FAIL',
  'WAITING_HUMAN',
  'BLOCKED_DEPENDENCY',
  'UNKNOWN',
  'INVALIDATED',
  'PASS',
  'NOT_APPLICABLE',
]

export function mostSevere(statuses: readonly CheckStatus[]): CheckStatus | undefined {
  return severity.find((status) => statuses.includes(status))
}
