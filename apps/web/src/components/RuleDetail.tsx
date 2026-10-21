import type { CheckScope } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import type { RuleInfo } from '../api'
import { agentLabels, checkStatusLabels, kindLabels } from '../labels'

const scopeLabel = (scope: CheckScope) =>
  scope.kind === 'order'
    ? '整单'
    : scope.kind === 'cargoItem'
      ? `货物 ${scope.cargoItemId}`
      : `运输段 ${scope.legId}`

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

interface Props {
  rule: RuleInfo
  outcomes: RuleOutcome[]
  onClose(): void
}

export function RuleDetail({ rule, outcomes, onClose }: Props) {
  return (
    <aside className="rule-detail">
      <header>
        <h3>
          {rule.ruleId} {rule.title}
        </h3>
        <button type="button" className="secondary" onClick={onClose}>
          关闭
        </button>
      </header>
      <p>
        {agentLabels[rule.owner] ?? rule.owner} · {kindLabels[rule.kind]} · 依赖{' '}
        {rule.dependsOn.join('、') || '无'}
      </p>
      <table>
        <thead>
          <tr>
            <th>作用域</th>
            <th>状态</th>
            <th>观察值</th>
            <th>阻塞于</th>
            <th>失效原因</th>
          </tr>
        </thead>
        <tbody>
          {outcomes.map((outcome) => (
            <tr key={JSON.stringify(outcome.scope)}>
              <td>{scopeLabel(outcome.scope)}</td>
              <td className={`check-status ${outcome.status}`}>
                {checkStatusLabels[outcome.status]}
                {outcome.reused ? '（复用）' : ''}
              </td>
              <td>
                {outcome.error ??
                  (outcome.observedValue === undefined ? '' : show(outcome.observedValue))}
              </td>
              <td>{outcome.blockedBy.join('、')}</td>
              <td>{outcome.invalidatedBy ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  )
}
