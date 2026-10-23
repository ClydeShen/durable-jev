import type { HumanTask } from '@durable-jev/contracts'
import { useState } from 'react'
import type { RuleInfo, TaskDecision } from '../api'
import { countOf, evidenceLabels } from '../labels'
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

/** Tasks this role has in other cases, folded away; open, they are grouped by case. */
function OtherCases({
  tasks,
  titles,
  onSelectCase,
}: {
  tasks: readonly HumanTask[]
  titles: ReadonlyMap<string, string>
  onSelectCase(caseId: string): void
}) {
  if (tasks.length === 0) return null
  const byCase = new Map<string, HumanTask[]>()
  for (const task of tasks) byCase.set(task.caseId, [...(byCase.get(task.caseId) ?? []), task])
  return (
    <details className="other-cases">
      <summary>{countOf(tasks.length, 'task')} in other cases</summary>
      <ul>
        {[...byCase].map(([caseId, caseTasks]) => (
          <li key={caseId}>
            <button type="button" className="link-action" onClick={() => onSelectCase(caseId)}>
              {caseId}
            </button>
            <ul>
              {caseTasks.map((task) => (
                <li key={task.humanTaskId}>
                  {task.ruleId} {titles.get(task.ruleId)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function TaskPanel(props: Props) {
  const { tasks, rules, caseId, message, onDecide, onShowRule, onSelectCase } = props
  const titles = new Map(rules.map((rule) => [rule.ruleId, rule.title]))
  const own = tasks.filter((task) => task.caseId === caseId)
  const others = tasks.filter((task) => task.caseId !== caseId)
  return (
    <section className="task-panel">
      <h2>
        My tasks
        <span className="count">{own.length}</span>
      </h2>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {own.length === 0 ? (
        <p className="empty">No tasks in this case</p>
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
      <OtherCases tasks={others} titles={titles} onSelectCase={onSelectCase} />
    </section>
  )
}
