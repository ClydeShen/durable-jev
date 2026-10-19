import type { CheckResult } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { upstreamOf } from './rule-graph.js'
import { StatusBadge } from './StatusBadge.js'

const evaluatorLabels: Record<string, string> = {
  code: 'code',
  decisionTable: 'table',
  semantic: 'Jev',
  humanGate: 'human',
  combinator: 'combinator',
}

type RuleTreeProps = {
  rootRuleId: string
  rules: RuleDefinition[]
  checks: CheckResult[]
}

export function RuleTree({ rootRuleId, rules, checks }: RuleTreeProps) {
  const rulesById = new Map(rules.map((rule) => [rule.ruleId as string, rule]))
  const checksByRule = Map.groupBy(checks, (check) => check.ruleId as string)
  return (
    <ul className="rule-tree">
      <RuleNode
        ruleId={rootRuleId}
        rulesById={rulesById}
        checksByRule={checksByRule}
        ancestors={[]}
      />
    </ul>
  )
}

function RuleNode(props: {
  ruleId: string
  rulesById: Map<string, RuleDefinition>
  checksByRule: Map<string, CheckResult[]>
  ancestors: string[]
}) {
  const { ruleId, rulesById, checksByRule, ancestors } = props
  const rule = rulesById.get(ruleId)
  const checks = checksByRule.get(ruleId) ?? []
  const children = rule ? upstreamOf(rule) : []
  const needsAttention = checks.some((check) => check.gateStatus !== 'PASS')
  const blockedBy = [...new Set(checks.flatMap((check) => check.blockedBy))]

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
      {blockedBy.length > 0 && (
        <span className="muted small">blocked by {blockedBy.join(', ')}</span>
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
              rulesById={rulesById}
              checksByRule={checksByRule}
              ancestors={[...ancestors, ruleId]}
            />
          ))}
        </ul>
      </details>
    </li>
  )
}
