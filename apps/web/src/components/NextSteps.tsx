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
    ? `（第 ${task.approvalChain.stepIndex + 1}/${task.approvalChain.stepCount} 步）`
    : ''
  return (
    <li>
      <RoleChip forRole={task.requiredRole} />
      <span>{task.taskType === 'APPROVAL' ? '批准' : '完成'}</span>
      <Chip onClick={onShowRule} title="在规则图里查看这条规则">
        {task.ruleId}
      </Chip>
      <span className="muted">
        {title}
        {step}
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
        <span>确认或否决调查助手的改派建议</span>
      </li>
    )),
    ...(detail.status === 'READY_TO_DISPATCH'
      ? [
          <li key="dispatch">
            <RoleChip forRole="dispatcher" />
            <span>确认发运（案例上方的按钮）</span>
          </li>,
        ]
      : []),
  ]
  if (detail.status === 'DISPATCHED') {
    return (
      <section className="next-steps done" aria-label="下一步">
        <span className="next-label">✓ 已发运</span>
        <span className="muted">这个案例的流程已经结束</span>
      </section>
    )
  }
  return (
    <section className="next-steps" aria-label="下一步">
      <span className="next-label">下一步</span>
      {steps.length > 0 ? (
        <ul>{steps}</ul>
      ) : (
        <span className="muted">
          {failed.length > 0
            ? `没有人能推进：${failed.join('、')} 不通过，需要变更资料`
            : '没有待办，agent 正在评估'}
        </span>
      )}
    </section>
  )
}
