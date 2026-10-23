import type { CheckScope, CheckStatus } from '@durable-jev/contracts'
import type { TimelineEntry } from './api'
import { checkStatusLabels } from './labels'

export const eventLabels: Record<string, string> = {
  'case.submitted': '收到订单',
  'rule.evaluated': '规则结果',
  'result.invalidated': '结果失效',
  'jev.completed': 'Jev 判断',
  'human_task.opened': '开出人工任务',
  'human_task.decided': '人工处理',
  'human_task.closed': '人工任务结束',
  'investigation.started': '开始调查',
  'investigation.tool_called': '调查助手查资料',
  'investigation.proposed': '调查助手提议',
  'investigation.escalated': '调查转人工',
  'investigation.confirmed': '确认改派',
  'investigation.rejected': '否决改派',
  'investigation.stale': '提议过期',
  'case.dispatched': '已发运',
}

/** Payload fields a person reads to judge what happened, with their names. */
export const fieldLabels: Record<string, string> = {
  ruleId: '规则',
  scope: '范围',
  status: '状态',
  previousStatus: '原状态',
  change: '变更',
  caseRevision: '资料版本',
  judgement: 'Jev 的判断',
  durationMs: '耗时',
  actor: '操作人',
  incident: '事件',
  tool: '工具',
  args: '参数',
  blocked: '被拦截原因',
  proposal: '提议',
  rationale: '理由',
  checks: '规则预检',
  escalation: '转人工原因',
  decidedBy: '决定人',
  confirmedBy: '确认人',
  legId: '运输段',
  offerId: '运力报价',
  carrierId: '承运商',
  vehicleId: '车辆',
  plannedDeparture: '计划出发',
  plannedArrival: '计划到达',
  extraCostCents: '额外费用',
  role: '角色',
  id: '姓名',
  at: '时间',
  type: '类型',
  title: '标题',
}

/** Identifiers and bookkeeping: kept for the record, shown small. */
export const technicalFields = new Set([
  'correlationId',
  'questionId',
  'promptVersion',
  'inputHash',
  'provider',
  'modelId',
  'usage',
  'humanTaskId',
  'investigationId',
])

export const taskStatusLabels: Record<string, string> = {
  OPEN: '待处理',
  COMPLETED: '已完成',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
  SUPERSEDED: '已被新资料版本取代',
}

export function scopeText(scope: unknown): string {
  const value = scope as CheckScope | undefined
  if (value?.kind === 'cargoItem') return `货物 ${value.cargoItemId}`
  if (value?.kind === 'leg') return `运输段 ${value.legId}`
  return '整单'
}

const statusText = (status: unknown) => checkStatusLabels[status as CheckStatus] ?? String(status)

export function jevAnswer(judgement: unknown): string {
  const value = judgement as {
    choice?: string
    probability?: number
    probabilities?: Record<string, number>
  }
  if (value.choice) return `${value.choice}（把握 ${value.probabilities?.[value.choice] ?? '?'}）`
  if (value.probability !== undefined) return `成立的把握 ${value.probability}`
  return '已回答'
}

/** One line a person understands at a glance. */
export function summary(entry: TimelineEntry, titles: ReadonlyMap<string, string>): string {
  const payload = entry.payload
  const rule = `${payload.ruleId}「${titles.get(String(payload.ruleId)) ?? ''}」`
  switch (entry.eventName) {
    case 'case.submitted':
      return `开始评估资料版本 r${payload.caseRevision}`
    case 'rule.evaluated':
      return `${rule}${scopeText(payload.scope)}：${statusText(payload.status)}`
    case 'result.invalidated':
      return `${rule}${scopeText(payload.scope)}因 ${payload.change} 需要重新判断`
    case 'jev.completed':
      return `${payload.questionId}「${titles.get(String(payload.questionId)) ?? ''}」：${jevAnswer(payload.judgement)}`
    case 'human_task.decided': {
      const actor = payload.actor as { id?: string } | undefined
      return `${actor?.id ?? ''} ${taskStatusLabels[String(payload.status)] ?? payload.status} ${rule}`
    }
    case 'human_task.opened':
    case 'human_task.closed':
      return `${rule}：${taskStatusLabels[String(payload.status)] ?? payload.status}`
    case 'investigation.tool_called':
      return payload.blocked ? `${payload.tool}（被拦截）` : String(payload.tool)
    case 'investigation.proposed':
      return `建议改派到 ${(payload.proposal as { offerId?: string } | undefined)?.offerId ?? ''}`
    case 'investigation.escalated':
      return String(payload.escalation)
    case 'investigation.confirmed':
    case 'investigation.rejected':
      return `由 ${(payload.decidedBy as { id?: string } | undefined)?.id ?? ''} 决定`
    case 'case.dispatched':
      return `${payload.confirmedBy} 确认发运资料版本 r${payload.caseRevision}`
    default:
      return ''
  }
}
