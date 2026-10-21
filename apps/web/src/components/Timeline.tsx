import type { CheckScope, CheckStatus } from '@durable-jev/contracts'
import { useState } from 'react'
import type { TimelineEntry } from '../api'
import { agentLabels, checkStatusLabels } from '../labels'

const scopeSuffix = (scope: unknown) => {
  const value = scope as CheckScope | undefined
  if (value?.kind === 'cargoItem') return ` · ${value.cargoItemId}`
  if (value?.kind === 'leg') return ` · ${value.legId}`
  return ''
}

const statusLabel = (status: unknown) => checkStatusLabels[status as CheckStatus] ?? String(status)

function describe(entry: TimelineEntry): string {
  const payload = entry.payload
  switch (entry.eventName) {
    case 'case.submitted':
      return `收到订单 r${payload.caseRevision}`
    case 'rule.evaluated':
      return `${payload.ruleId}${scopeSuffix(payload.scope)} → ${statusLabel(payload.status)}`
    case 'result.invalidated':
      return `${payload.ruleId}${scopeSuffix(payload.scope)} 因 ${payload.change} 失效（原为${statusLabel(payload.previousStatus)}）`
    case 'jev.completed':
      return `${payload.questionId} 判断 ${JSON.stringify(payload.judgement)}（${payload.provider} / ${payload.modelId}，${payload.durationMs} ms）`
    case 'human_task.opened':
      return `${payload.ruleId} 人工任务开启`
    case 'human_task.decided':
      return `${payload.ruleId} 人工任务 ${payload.status}`
    case 'human_task.closed':
      return `${payload.ruleId} 人工任务结束：${payload.status}`
    case 'case.dispatched':
      return `调度员 ${payload.confirmedBy} 确认发运 r${payload.caseRevision}`
    default:
      return JSON.stringify(payload)
  }
}

interface Props {
  entries: TimelineEntry[]
}

export function Timeline({ entries }: Props) {
  const [showRuleChanges, setShowRuleChanges] = useState(false)
  const visible = entries.filter((entry) => showRuleChanges || entry.eventName !== 'rule.evaluated')
  return (
    <section className="timeline">
      <label className="timeline-filter">
        <input
          type="checkbox"
          checked={showRuleChanges}
          onChange={(event) => setShowRuleChanges(event.target.checked)}
        />
        显示每条规则的状态变化
      </label>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>Agent</th>
            <th>事件</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <tr key={entry.eventId}>
              <td>{new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</td>
              <td>
                <span className={`agent-chip ${entry.agentId}`}>
                  {agentLabels[entry.agentId] ?? entry.agentId}
                </span>
              </td>
              <td>{entry.eventName}</td>
              <td>{describe(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
