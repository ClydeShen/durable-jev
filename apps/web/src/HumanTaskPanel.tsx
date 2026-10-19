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
      <h2>Human tasks</h2>
      {openTasks.length === 0 && <p className="muted">No open human tasks.</p>}
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
          <summary className="muted">{closedTasks.length} closed</summary>
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
        <span className="tag">{task.taskType === 'APPROVAL' ? 'approval' : 'operation'}</span>
        <span className="muted small">requires {roleLabels[task.requiredRole]}</span>
      </header>
      <p className="muted small">
        bound to r{task.target.caseRevision} · due{' '}
        {new Date(task.expiresAt).toLocaleString('en-GB')}
      </p>
      {roleMismatch && (
        <p className="warning small">
          You are acting as {roleLabels[actingRole]}; the server will reject this action.
        </p>
      )}

      {task.ruleId === dispatchConfirmationRuleId ? (
        <button type="button" className="primary" onClick={() => actions.dispatch()}>
          Confirm dispatch
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
            Submit evidence
          </button>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="primary" onClick={() => actions.approve(task)}>
            Approve
          </button>
          <input
            placeholder="Rejection reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <button type="button" disabled={!reason} onClick={() => actions.reject(task, reason)}>
            Reject
          </button>
        </div>
      )}
    </article>
  )
}
