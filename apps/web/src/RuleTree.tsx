import type { CheckResult, HumanTask } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { roleLabels } from './roles.js'
import { rootBlockers, upstreamOf } from './rule-graph.js'
import { StatusBadge } from './StatusBadge.js'

const evaluatorLabels: Record<string, string> = {
  code: 'code',
  decisionTable: 'table',
  semantic: 'Jev',
  humanGate: 'human',
  combinator: 'combinator',
}

const settledStatuses = new Set(['PASS', 'NOT_APPLICABLE'])

type RuleTreeProps = {
  rootRuleId: string
  rules: RuleDefinition[]
  checks: CheckResult[]
  humanTasks: HumanTask[]
}

type TreeContext = {
  rulesById: Map<string, RuleDefinition>
  checksByRule: Map<string, CheckResult[]>
  openTaskRoleByRule: Map<string, string>
}

export function RuleTree({ rootRuleId, rules, checks, humanTasks }: RuleTreeProps) {
  const context: TreeContext = {
    rulesById: new Map(rules.map((rule) => [rule.ruleId as string, rule])),
    checksByRule: Map.groupBy(checks, (check) => check.ruleId as string),
    openTaskRoleByRule: new Map(
      humanTasks
        .filter((task) => task.status === 'OPEN')
        .map((task) => [task.ruleId as string, roleLabels[task.requiredRole]]),
    ),
  }
  return (
    <ul className="rule-tree">
      <RuleNode ruleId={rootRuleId} context={context} ancestors={[]} />
    </ul>
  )
}

function describeBlocker(ruleId: string, context: TreeContext): string {
  const role = context.openTaskRoleByRule.get(ruleId)
  if (role) return `${ruleId} · ${role}`
  const statuses = [
    ...new Set((context.checksByRule.get(ruleId) ?? []).map((check) => check.gateStatus)),
  ]
  return statuses.length > 0 ? `${ruleId} (${statuses.join(', ').toLowerCase()})` : ruleId
}

function RuleNode(props: { ruleId: string; context: TreeContext; ancestors: string[] }) {
  const { ruleId, context, ancestors } = props
  const { rulesById, checksByRule } = context
  const rule = rulesById.get(ruleId)
  const checks = checksByRule.get(ruleId) ?? []
  const children = rule ? upstreamOf(rule) : []
  const needsAttention = checks.some((check) => !settledStatuses.has(check.gateStatus))
  const blockedBy = [...new Set(checks.flatMap((check) => check.blockedBy as string[]))]
  const waitingOn = rootBlockers(blockedBy, checksByRule)

  const summary = (
    <span className="rule-row">
      <span className="rule-id">{ruleId}</span>
      {rule && <span className="tag">{evaluatorLabels[rule.evaluator.kind]}</span>}
      <span className="rule-statuses">
        {checks.map((check) => (
          <span key={check.checkResultId} className="rule-status">
            {check.subject.scope !== 'order' && (
              <span className="muted small">{check.subject.entityId}</span>
            )}
            <StatusBadge status={check.gateStatus} />
          </span>
        ))}
      </span>
      {waitingOn.length > 0 && (
        <span className="muted small">
          waiting on {waitingOn.map((blocker) => describeBlocker(blocker, context)).join('; ')}
        </span>
      )}
    </span>
  )

  if (children.length === 0) return <li className="leaf">{summary}</li>
  return (
    <li>
      <details open={needsAttention && ancestors.length < 6}>
        <summary>{summary}</summary>
        <ul>
          {children.map((childRuleId) => (
            <RuleNode
              key={childRuleId}
              ruleId={childRuleId}
              context={context}
              ancestors={[...ancestors, ruleId]}
            />
          ))}
        </ul>
      </details>
    </li>
  )
}
