import type { HumanTask } from '@durable-jev/contracts'
import { useState } from 'react'
import type { Actor, RuleInfo, TaskDecision } from '../api'
import { evidenceLabels, roleLabels } from '../labels'
import { Chip, Field, Fields } from './ui'

const deadline = (timestamp: string) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

interface TaskCardProps {
  task: HumanTask
  ruleTitle?: string
  onDecide(decision: TaskDecision): void
  onShowRule(): void
}

function TaskCard({ task, ruleTitle, onDecide, onShowRule }: TaskCardProps) {
  const [fields, setFields] = useState<Record<string, string>>({})
  const operation = task.taskType === 'OPERATION'
  return (
    <li className="task">
      <header className="task-header">
        <Chip onClick={onShowRule} title="在规则图里查看这条规则">
          {task.ruleId}
        </Chip>
        <span className="tag">{operation ? '现场操作' : '审批'}</span>
      </header>
      {ruleTitle && <p className="task-title">{ruleTitle}</p>}
      <Fields>
        {task.approvalChain && (
          <Field label="审批步骤">
            第 {task.approvalChain.stepIndex + 1} 步，共 {task.approvalChain.stepCount} 步
          </Field>
        )}
        <Field label="截止">{deadline(task.expiresAt)}</Field>
      </Fields>
      {operation ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onDecide({
              type: 'complete',
              fields,
              evidenceRefs: Object.values(fields).filter(Boolean),
            })
          }}
        >
          {task.evidenceRequirements.map((field) => (
            <label key={field} className="evidence">
              <span>
                {evidenceLabels[field] ?? field} <code>{field}</code>
              </span>
              <input
                value={fields[field] ?? ''}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
            </label>
          ))}
          <button type="submit">完成并提交</button>
        </form>
      ) : (
        <div className="actions">
          <button type="button" onClick={() => onDecide({ type: 'approve' })}>
            批准
          </button>
          <button type="button" className="danger" onClick={() => onDecide({ type: 'reject' })}>
            拒绝
          </button>
        </div>
      )}
    </li>
  )
}

interface Props {
  actor: Actor
  /** Every open task for the actor's role, across cases. */
  tasks: HumanTask[]
  rules: RuleInfo[]
  /** The case on screen; only its tasks are listed. */
  caseId?: string
  message?: string
  onDecide(task: HumanTask, decision: TaskDecision): void
  onShowRule(caseId: string, ruleId: string): void
  onSelectCase(caseId: string): void
}

/** Other cases with tasks for this role, so the presenter can switch to them. */
function OtherCases({
  counts,
  onSelectCase,
}: {
  counts: Map<string, number>
  onSelectCase(caseId: string): void
}) {
  if (counts.size === 0) return null
  return (
    <p className="other-cases">
      <span className="stat-label">其他案例的待办</span>
      {[...counts].map(([caseId, count]) => (
        <Chip key={caseId} onClick={() => onSelectCase(caseId)} title="切换到这个案例">
          {caseId} {count}
        </Chip>
      ))}
    </p>
  )
}

export function TaskPanel(props: Props) {
  const { actor, tasks, rules, caseId, message, onDecide, onShowRule, onSelectCase } = props
  const titles = new Map(rules.map((rule) => [rule.ruleId, rule.title]))
  const own = tasks.filter((task) => task.caseId === caseId)
  const others = new Map<string, number>()
  for (const task of tasks) {
    if (task.caseId !== caseId) others.set(task.caseId, (others.get(task.caseId) ?? 0) + 1)
  }
  return (
    <section className="task-panel">
      <h2>
        {roleLabels[actor.role]} {actor.id} 的待办
        <span className="count">{own.length}</span>
      </h2>
      <p className="hint">{caseId} 中需要你处理的</p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {own.length === 0 ? (
        <p className="empty">这个案例没有你的待办</p>
      ) : (
        <ul>
          {own.map((task) => (
            <TaskCard
              key={task.humanTaskId}
              task={task}
              ruleTitle={titles.get(task.ruleId)}
              onDecide={(decision) => onDecide(task, decision)}
              onShowRule={() => onShowRule(task.caseId, task.ruleId)}
            />
          ))}
        </ul>
      )}
      <OtherCases counts={others} onSelectCase={onSelectCase} />
    </section>
  )
}
