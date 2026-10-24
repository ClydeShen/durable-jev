import type { HumanTask } from '@durable-jev/contracts'
import type { CaseDetail, RuleInfo } from '../api'
import { Chip, RoleChip } from './chips'

interface Props {
  detail: CaseDetail
  rules: readonly RuleInfo[]
  onShowRule(ruleId: string): void
}

function TaskStep({
  task,
  title,
  onShowRule,
}: {
  task: HumanTask
  title?: string
  onShowRule(): void
}) {
  const step = task.approvalChain
    ? ` (step ${task.approvalChain.stepIndex + 1} of ${task.approvalChain.stepCount})`
    : ''
  return (
    <li>
      <RoleChip forRole={task.requiredRole} />
      <span className="next-step-action">
        <span>{task.taskType === 'APPROVAL' ? 'approves' : 'completes'}</span>
        <Chip onClick={onShowRule} title="Show this rule in the rule graph">
          {task.ruleId}
        </Chip>
        <span className="muted">
          {title}
          {step}
        </span>
      </span>
    </li>
  )
}

/**
 * The case's objective tracker, like a game HUD: who has to do what next, each with the role to
 * switch to and the rule to jump to. It follows the case, so it is always the next move.
 */
export function NextSteps({ detail, rules, onShowRule }: Props) {
  const titles = new Map(rules.map((rule) => [rule.ruleId, rule.title]))
  const tasks = detail.tasks.filter((task) => task.status === 'OPEN')
  const proposals = detail.investigations.filter((item) => item.status === 'PROPOSED')
  const failed = [
    ...new Set(
      detail.outcomes
        .filter((outcome) => outcome.status === 'FAIL')
        .map((outcome) => outcome.ruleId),
    ),
  ]
  const steps = [
    ...tasks.map((task) => (
      <TaskStep
        key={task.humanTaskId}
        task={task}
        title={titles.get(task.ruleId)}
        onShowRule={() => onShowRule(task.ruleId)}
      />
    )),
    ...proposals.map((proposal) => (
      <li key={proposal.investigationId}>
        <RoleChip forRole="transportPlanner" />
        <span className="next-step-action">confirms the reroute</span>
      </li>
    )),
    ...(detail.status === 'READY_TO_DISPATCH'
      ? [
          <li key="dispatch">
            <RoleChip forRole="dispatcher" />
            <span className="next-step-action">confirms dispatch</span>
          </li>,
        ]
      : []),
  ]
  if (detail.status === 'DISPATCHED') {
    return (
      <section className="next-steps done" aria-label="Next steps">
        <span className="next-label">✓ Dispatched</span>
      </section>
    )
  }
  return (
    <section className="next-steps" aria-label="Next steps">
      <span className="next-label">Next</span>
      {steps.length > 0 ? (
        <ul>{steps}</ul>
      ) : (
        <span className="muted">
          {failed.length > 0
            ? `Blocked: ${failed.join(', ')} failed; the order must change`
            : 'Evaluating…'}
        </span>
      )}
    </section>
  )
}
