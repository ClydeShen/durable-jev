import type { HumanTask, Role } from '@durable-jev/contracts'
import { useState } from 'react'
import { Dot, Icon } from './icons.js'
import { roleLabels } from './roles.js'
import { StatusBadge } from './StatusBadge.js'

const dispatchConfirmationRuleId = 'R39-CONFIRM'

const conditionLabels: Record<string, string> = { REWORK_REQUIRED: 'rework required' }

export type HumanTaskActions = {
  approve: (task: HumanTask, conditions?: string[]) => Promise<void>
  reject: (task: HumanTask, reason: string) => Promise<void>
  complete: (task: HumanTask, fields: Record<string, string>) => Promise<void>
  dispatch: () => Promise<void>
}

export function HumanTaskPanel(props: {
  tasks: HumanTask[]
  actingRole: Role
  actions: HumanTaskActions
  decisionConditionsByRule: ReadonlyMap<string, readonly string[]>
  ruleTitles: ReadonlyMap<string, string>
}) {
  const openTasks = props.tasks.filter((task) => task.status === 'OPEN')
  const closedTasks = props.tasks.filter((task) => task.status !== 'OPEN')
  return (
    <section>
      <h2>Human tasks</h2>
      {openTasks.length === 0 && (
        <p className="muted">Nothing is waiting for a person right now.</p>
      )}
      {openTasks.map((task) => (
        <OpenTaskCard
          key={task.humanTaskId}
          task={task}
          actingRole={props.actingRole}
          actions={props.actions}
          decisionConditions={props.decisionConditionsByRule.get(task.ruleId) ?? []}
          title={props.ruleTitles.get(task.ruleId)}
        />
      ))}
      {closedTasks.length > 0 && (
        <details>
          <summary className="muted">{closedTasks.length} closed</summary>
          <ul className="closed-tasks">
            {closedTasks.map((task) => (
              <li key={task.humanTaskId}>
                {props.ruleTitles.get(task.ruleId) ?? task.ruleId}{' '}
                <span className="muted small">{task.ruleId}</span>{' '}
                <StatusBadge status={task.status} /> {roleLabels[task.requiredRole]}
                {task.supersededBy && (
                  <span className="muted small">
                    {' '}
                    <Dot /> superseded by {task.supersededBy}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function OpenTaskCard(props: {
  task: HumanTask
  actingRole: Role
  actions: HumanTaskActions
  decisionConditions: readonly string[]
  title: string | undefined
}) {
  const { task, actingRole, actions, decisionConditions, title } = props
  const [fields, setFields] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const roleMismatch = actingRole !== task.requiredRole

  return (
    <article className="task-card">
      <header>
        <strong>{title ?? task.ruleId}</strong>
        {title && <span className="muted small">{task.ruleId}</span>}
        <span className="tag">{task.taskType === 'APPROVAL' ? 'approval' : 'operation'}</span>
        <span className="muted small">requires {roleLabels[task.requiredRole]}</span>
      </header>
      <p className="muted small">
        bound to r{task.target.caseRevision} <Dot /> due{' '}
        {new Date(task.expiresAt).toLocaleString('en-GB')}
      </p>
      {roleMismatch && (
        <p className="warning small">
          You are acting as {roleLabels[actingRole]}; the server will reject this action.
        </p>
      )}

      {task.ruleId === dispatchConfirmationRuleId ? (
        <button type="button" className="primary" onClick={() => actions.dispatch()}>
          <Icon name="dispatched" /> Confirm dispatch
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
            <Icon name="approve" /> Submit evidence
          </button>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="primary" onClick={() => actions.approve(task)}>
            <Icon name="approve" /> Approve
          </button>
          {decisionConditions.map((condition) => (
            <button
              key={condition}
              type="button"
              onClick={() => actions.approve(task, [condition])}
            >
              <Icon name="approve" /> Approve, {conditionLabels[condition] ?? condition}
            </button>
          ))}
          <input
            placeholder="Rejection reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <button type="button" disabled={!reason} onClick={() => actions.reject(task, reason)}>
            <Icon name="reject" /> Reject
          </button>
        </div>
      )}
    </article>
  )
}
