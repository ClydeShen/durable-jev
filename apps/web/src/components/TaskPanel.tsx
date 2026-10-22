import type { HumanTask } from '@durable-jev/contracts'
import { useState } from 'react'
import type { Actor, TaskDecision } from '../api'
import { roleLabels } from '../labels'

interface TaskCardProps {
  task: HumanTask
  onDecide(decision: TaskDecision): void
}

function TaskCard({ task, onDecide }: TaskCardProps) {
  const [fields, setFields] = useState<Record<string, string>>({})
  const step = task.approvalChain
    ? `第 ${task.approvalChain.stepIndex + 1}/${task.approvalChain.stepCount} 步 · `
    : ''
  return (
    <li className="task">
      <strong>
        {task.caseId} · {task.ruleId}
      </strong>
      <small>
        {step}
        {roleLabels[task.requiredRole]} · 截止 {new Date(task.expiresAt).toLocaleString('zh-CN')}
      </small>
      {task.taskType === 'OPERATION' ? (
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
            <label key={field}>
              {field}
              <input
                value={fields[field] ?? ''}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
            </label>
          ))}
          <button type="submit">完成并提交证据</button>
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
  tasks: HumanTask[]
  message?: string
  onDecide(task: HumanTask, decision: TaskDecision): void
}

export function TaskPanel({ actor, tasks, message, onDecide }: Props) {
  return (
    <section className="task-panel">
      <h2>{roleLabels[actor.role]} 的待办</h2>
      {message && <p className="message">{message}</p>}
      {tasks.length === 0 ? (
        <p className="empty">暂无待办</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <TaskCard
              key={task.humanTaskId}
              task={task}
              onDecide={(decision) => onDecide(task, decision)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
