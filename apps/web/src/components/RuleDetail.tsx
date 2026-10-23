import type { CheckScope } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import type { AgentNames, RuleInfo } from '../api'
import { changeLabels, kindExplanations, kindLabels, mostSevere, ruleScopeLabels } from '../labels'
import { ExpressionLine, RuleCheckView } from './RuleCheckView'
import { Chip, Drawer, Field, Fields, Section, StatusBadge, Tags } from './ui'

const applicabilityLabels: Record<string, string> = {
  destinations: '目的地',
  commodityGroups: '商品组',
  customers: '客户',
}

function scopeLabel(scope: CheckScope): string {
  if (scope.kind === 'cargoItem') return `货物 ${scope.cargoItemId}`
  if (scope.kind === 'leg') return `运输段 ${scope.legId}`
  return '整单'
}

function ObservedValue({ value }: { value: unknown }) {
  if (value === undefined) return <span className="muted">无</span>
  if (value === null || typeof value !== 'object') return <>{String(value)}</>
  return <pre className="data">{JSON.stringify(value, null, 2)}</pre>
}

function OutcomeCard({
  outcome,
  onOpenRule,
}: {
  outcome: RuleOutcome
  onOpenRule(ruleId: string): void
}) {
  return (
    <article className={`outcome-card check-status ${outcome.status}`}>
      <header>
        <strong>{scopeLabel(outcome.scope)}</strong>
        <StatusBadge status={outcome.status} />
        {outcome.reused && <span className="tag">沿用上次结果</span>}
      </header>
      <Fields>
        {outcome.error ? (
          <Field label="错误">{outcome.error}</Field>
        ) : (
          <Field label="观察值">
            <ObservedValue value={outcome.observedValue} />
          </Field>
        )}
        {outcome.blockedBy.length > 0 && (
          <Field label="在等">
            {outcome.blockedBy.map((ruleId) => (
              <Chip key={ruleId} onClick={() => onOpenRule(ruleId)}>
                {ruleId}
              </Chip>
            ))}
          </Field>
        )}
        {outcome.invalidatedBy && <Field label="因变更重算">{outcome.invalidatedBy}</Field>}
      </Fields>
    </article>
  )
}

function RuleChips({
  ruleIds,
  onOpenRule,
}: {
  ruleIds: string[]
  onOpenRule(ruleId: string): void
}) {
  if (ruleIds.length === 0) return <span className="muted">无</span>
  return (
    <span className="chips">
      {ruleIds.map((ruleId) => (
        <Chip key={ruleId} onClick={() => onOpenRule(ruleId)}>
          {ruleId}
        </Chip>
      ))}
    </span>
  )
}

function Relations({ rule, rules, agentNames, onOpenRule }: Omit<Props, 'outcomes' | 'onClose'>) {
  const { definition } = rule
  const dependents = rules.filter((other) => other.dependsOn.includes(rule.ruleId))
  const applicability = Object.entries(definition.applicability ?? {})
  return (
    <Fields>
      <Field label="负责的 agent">{agentNames[rule.owner] ?? rule.owner}</Field>
      <Field label="检查范围">{ruleScopeLabels[rule.scope]}</Field>
      <Field label="先要等">
        <RuleChips ruleIds={rule.dependsOn} onOpenRule={onOpenRule} />
      </Field>
      <Field label="结论供给">
        <RuleChips ruleIds={dependents.map((other) => other.ruleId)} onOpenRule={onOpenRule} />
      </Field>
      {definition.appliesWhen && (
        <Field label="只在此时适用">
          <ExpressionLine expression={definition.appliesWhen} onOpenRule={onOpenRule} />
        </Field>
      )}
      {applicability.length > 0 && (
        <Field label="扩展规则，仅选中于">
          <Tags
            items={applicability.flatMap(([dimension, values]) =>
              values.map((value) => `${applicabilityLabels[dimension] ?? dimension} ${value}`),
            )}
          />
        </Field>
      )}
      <Field label="缺少资料时">
        {definition.unknownPolicy === 'block' ? '判为未知，后续规则等待' : '转给人工处理'}
      </Field>
      <Field label="这些资料变了会重算">
        <Tags
          items={definition.invalidationTriggers.map((change) => changeLabels[change] ?? change)}
        />
      </Field>
    </Fields>
  )
}

interface Props {
  rule: RuleInfo
  rules: RuleInfo[]
  agentNames: AgentNames
  outcomes: RuleOutcome[]
  onOpenRule(ruleId: string): void
  onClose(): void
}

export function RuleDetail({ rule, rules, agentNames, outcomes, onOpenRule, onClose }: Props) {
  return (
    <Drawer
      onClose={onClose}
      heading={
        <>
          <Chip>{rule.ruleId}</Chip>
          <h3>{rule.title}</h3>
          <StatusBadge status={mostSevere(outcomes.map((outcome) => outcome.status))} />
        </>
      }
    >
      <Section title="这条规则检查什么">
        {rule.clause ? (
          <>
            {rule.clause.paragraphs.map((paragraph) => (
              <blockquote key={paragraph} className="policy">
                {paragraph}
              </blockquote>
            ))}
            <p className="source">
              出自政策 <span className="tag">{rule.clause.section}</span>
            </p>
          </>
        ) : (
          <p className="muted">政策里没有找到这条规则的原文。</p>
        )}
      </Section>
      <Section title={`怎么检查：${kindLabels[rule.kind]}，${kindExplanations[rule.kind]}`}>
        <RuleCheckView
          check={rule.definition}
          parameters={rule.parameters}
          onOpenRule={onOpenRule}
        />
      </Section>
      <Section title="和其他规则的关系">
        <Relations rule={rule} rules={rules} agentNames={agentNames} onOpenRule={onOpenRule} />
      </Section>
      <Section title="本单结果">
        {outcomes.length === 0 ? (
          <p className="muted">本单没有评估这条规则（不适用于本单或尚未轮到）。</p>
        ) : (
          outcomes.map((outcome) => (
            <OutcomeCard
              key={JSON.stringify(outcome.scope)}
              outcome={outcome}
              onOpenRule={onOpenRule}
            />
          ))
        )}
      </Section>
    </Drawer>
  )
}
