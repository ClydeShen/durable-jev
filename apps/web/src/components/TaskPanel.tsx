import type { HumanTask } from '@durable-jev/contracts'
import { useState } from 'react'
import type { Actor, RuleInfo, TaskDecision } from '../api'
import { evidenceLabels, roleLabels } from '../labels'
import { Chip, Tag } from './chips'
import { Field, Fields } from './ui'

const deadline = (timestamp: string) =>
  new Date(timestamp).toLocaleString('en-GB', {
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
        <Chip onClick={onShowRule} title="Show this rule in the rule graph">
          {task.ruleId}
        </Chip>
        <Tag>{operation ? 'Field operation' : 'Approval'}</Tag>
      </header>
      {ruleTitle && <p className="task-title">{ruleTitle}</p>}
      <Fields>
        {task.approvalChain && (
          <Field label="Approval step">
            Step {task.approvalChain.stepIndex + 1} of {task.approvalChain.stepCount}
          </Field>
        )}
        <Field label="Due">{deadline(task.expiresAt)}</Field>
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
          <button type="submit">Complete and submit</button>
        </form>
      ) : (
        <div className="actions">
          <button type="button" onClick={() => onDecide({ type: 'approve' })}>
            Approve
          </button>
          <button type="button" className="danger" onClick={() => onDecide({ type: 'reject' })}>
            Reject
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
      <span className="stat-label">Tasks in other cases</span>
      {[...counts].map(([caseId, count]) => (
        <Chip key={caseId} onClick={() => onSelectCase(caseId)} title="Switch to this case">
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
        Tasks for {roleLabels[actor.role]} {actor.id}
        <span className="count">{own.length}</span>
      </h2>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {own.length === 0 ? (
        <p className="empty">No tasks for you in this case</p>
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
