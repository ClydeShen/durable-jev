import type { HumanTask, Role } from '@durable-jev/contracts'
import { useState } from 'react'
import { roleLabels } from './roles.js'

const dispatchConfirmationRuleId = 'R39-CONFIRM'

export type HumanTaskActions = {
  approve: (task: HumanTask) => Promise<void>
  reject: (task: HumanTask, reason: string) => Promise<void>
  complete: (task: HumanTask, fields: Record<string, string>) => Promise<void>
  dispatch: () => Promise<void>
}

export function HumanTaskPanel(props: {
  tasks: HumanTask[]
  actingRole: Role
  actions: HumanTaskActions
}) {
  const openTasks = props.tasks.filter((task) => task.status === 'OPEN')
  const closedTasks = props.tasks.filter((task) => task.status !== 'OPEN')
  return (
    <section>
      <h2>人工任务</h2>
      {openTasks.length === 0 && <p className="muted">当前没有待处理的人工任务。</p>}
      {openTasks.map((task) => (
        <OpenTaskCard
          key={task.humanTaskId}
          task={task}
          actingRole={props.actingRole}
          actions={props.actions}
        />
      ))}
      {closedTasks.length > 0 && (
        <details>
          <summary className="muted">已关闭 {closedTasks.length} 个</summary>
          <ul className="closed-tasks">
            {closedTasks.map((task) => (
              <li key={task.humanTaskId}>
                {task.ruleId} · {task.status} · {roleLabels[task.requiredRole]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function OpenTaskCard(props: { task: HumanTask; actingRole: Role; actions: HumanTaskActions }) {
  const { task, actingRole, actions } = props
  const [fields, setFields] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const roleMismatch = actingRole !== task.requiredRole

  return (
    <article className="task-card">
      <header>
        <strong>{task.ruleId}</strong>
        <span className="tag">{task.taskType === 'APPROVAL' ? '审批' : '现场操作'}</span>
        <span className="muted small">需要：{roleLabels[task.requiredRole]}</span>
      </header>
      <p className="muted small">
        绑定版本 r{task.target.caseRevision} · 截止 {new Date(task.expiresAt).toLocaleString()}
      </p>
      {roleMismatch && (
        <p className="warning small">当前身份是{roleLabels[actingRole]}，服务端会拒绝此操作。</p>
      )}

      {task.ruleId === dispatchConfirmationRuleId ? (
        <button type="button" className="primary" onClick={() => actions.dispatch()}>
          确认发运
        </button>
      ) : task.taskType === 'OPERATION' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            actions.complete(task, fields)
          }}
        >
          {task.requiredEvidenceFields.map((field) => (
            <label key={field}>
              {field}
              <input
                value={fields[field] ?? ''}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
            </label>
          ))}
          <button type="submit" className="primary">
            提交完成证据
          </button>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="primary" onClick={() => actions.approve(task)}>
            批准
          </button>
          <input
            placeholder="拒绝原因"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <button type="button" disabled={!reason} onClick={() => actions.reject(task, reason)}>
            拒绝
          </button>
        </div>
      )}
    </article>
  )
}
