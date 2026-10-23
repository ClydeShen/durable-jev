import type { CheckScope, HumanTask } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import type { AgentNames, RuleInfo } from '../api'
import { changeLabels, kindExplanations, kindLabels, mostSevere, ruleScopeLabels } from '../labels'
import { Chip, RoleChip, StatusBadge, Tag, Tags } from './chips'
import { ExpressionLine, RuleCheckView } from './RuleCheckView'
import { Drawer, Field, Fields, Section } from './ui'

const applicabilityLabels: Record<string, string> = {
  destinations: 'destination',
  commodityGroups: 'commodity group',
  customers: 'customer',
}

function scopeLabel(scope: CheckScope): string {
  if (scope.kind === 'cargoItem') return `Item ${scope.cargoItemId}`
  if (scope.kind === 'leg') return `Leg ${scope.legId}`
  return 'Whole order'
}

const sameScope = (a: CheckScope, b: CheckScope) => scopeLabel(a) === scopeLabel(b)

/** Who the result waits for: the open task's role, and its step in an approval chain. */
function WaitingFor({ tasks }: { tasks: readonly HumanTask[] }) {
  if (tasks.length === 0) return <span className="muted">No task opened yet</span>
  return (
    <span className="chips">
      {tasks.map((task) => (
        <RoleChip
          key={task.humanTaskId}
          forRole={task.requiredRole}
          note={
            task.approvalChain
              ? `step ${task.approvalChain.stepIndex + 1} of ${task.approvalChain.stepCount}`
              : undefined
          }
        />
      ))}
    </span>
  )
}

function ObservedValue({ value }: { value: unknown }) {
  if (value === undefined) return <span className="muted">None</span>
  if (value === null || typeof value !== 'object') return <>{String(value)}</>
  return <pre className="data">{JSON.stringify(value, null, 2)}</pre>
}

function OutcomeCard({
  outcome,
  openTasks,
  onOpenRule,
}: {
  outcome: RuleOutcome
  /** The rule's open human tasks; the ones for this scope are what the result waits for. */
  openTasks: readonly HumanTask[]
  onOpenRule(ruleId: string): void
}) {
  const waiting = outcome.status === 'WAITING_HUMAN'
  return (
    <article className={`outcome-card check-status ${outcome.status}`}>
      <header>
        <strong>{scopeLabel(outcome.scope)}</strong>
        <StatusBadge status={outcome.status} />
        {outcome.reused && <Tag>Earlier result kept</Tag>}
      </header>
      <Fields>
        {waiting && (
          <Field label="Waits for">
            <WaitingFor tasks={openTasks.filter((task) => sameScope(task.scope, outcome.scope))} />
          </Field>
        )}
        {outcome.error && <Field label="Error">{outcome.error}</Field>}
        {!(waiting || outcome.error) && (
          <Field label="Observed value">
            <ObservedValue value={outcome.observedValue} />
          </Field>
        )}
        {outcome.blockedBy.length > 0 && (
          <Field label="Blocked by">
            {outcome.blockedBy.map((ruleId) => (
              <Chip key={ruleId} onClick={() => onOpenRule(ruleId)}>
                {ruleId}
              </Chip>
            ))}
          </Field>
        )}
        {outcome.invalidatedBy && (
          <Field label="Decided again after">{outcome.invalidatedBy}</Field>
        )}
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
  if (ruleIds.length === 0) return <span className="muted">None</span>
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

function Relations({
  rule,
  rules,
  agentNames,
  onOpenRule,
}: Omit<Props, 'outcomes' | 'openTasks' | 'onClose'>) {
  const { definition } = rule
  const dependents = rules.filter((other) => other.dependsOn.includes(rule.ruleId))
  const applicability = Object.entries(definition.applicability ?? {})
  return (
    <Fields>
      <Field label="Owned by">{agentNames[rule.owner] ?? rule.owner}</Field>
      <Field label="Checked">{ruleScopeLabels[rule.scope]}</Field>
      <Field label="Waits for rules">
        <RuleChips ruleIds={rule.dependsOn} onOpenRule={onOpenRule} />
      </Field>
      <Field label="Its result feeds">
        <RuleChips ruleIds={dependents.map((other) => other.ruleId)} onOpenRule={onOpenRule} />
      </Field>
      {definition.appliesWhen && (
        <Field label="Applies only when">
          <ExpressionLine expression={definition.appliesWhen} onOpenRule={onOpenRule} />
        </Field>
      )}
      {applicability.length > 0 && (
        <Field label="Specific rule, selected for">
          <Tags
            items={applicability.flatMap(([dimension, values]) =>
              values.map((value) => `${applicabilityLabels[dimension] ?? dimension} ${value}`),
            )}
          />
        </Field>
      )}
      <Field label="When data is missing">
        {definition.unknownPolicy === 'block' ? 'Unknown; later rules wait' : 'Handed to a person'}
      </Field>
      <Field label="Decided again when these change">
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
  /** This rule's open human tasks. */
  openTasks: HumanTask[]
  onOpenRule(ruleId: string): void
  onClose(): void
}

export function RuleDetail({
  rule,
  rules,
  agentNames,
  outcomes,
  openTasks,
  onOpenRule,
  onClose,
}: Props) {
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
      <Section title="What this rule checks">
        {rule.clause ? (
          <>
            {rule.clause.paragraphs.map((paragraph) => (
              <blockquote key={paragraph} className="policy">
                {paragraph}
              </blockquote>
            ))}
            <p className="source">
              From the policy <Tag>{rule.clause.section}</Tag>
            </p>
          </>
        ) : (
          <p className="muted">The policy text for this rule was not found.</p>
        )}
      </Section>
      <Section title={`How it checks: ${kindLabels[rule.kind]}, ${kindExplanations[rule.kind]}`}>
        <RuleCheckView
          check={rule.definition}
          parameters={rule.parameters}
          onOpenRule={onOpenRule}
        />
      </Section>
      <Section title="How it relates to other rules">
        <Relations rule={rule} rules={rules} agentNames={agentNames} onOpenRule={onOpenRule} />
      </Section>
      <Section title="Result in this order">
        {outcomes.length === 0 ? (
          <p className="muted">
            This rule was not evaluated for this order (it does not apply, or its turn has not
            come).
          </p>
        ) : (
          outcomes.map((outcome) => (
            <OutcomeCard
              key={JSON.stringify(outcome.scope)}
              outcome={outcome}
              openTasks={openTasks}
              onOpenRule={onOpenRule}
            />
          ))
        )}
      </Section>
    </Drawer>
  )
}
