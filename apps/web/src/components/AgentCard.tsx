import type { Role } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useState } from 'react'
import { agentRelations } from '../agent-relations'
import type { AgentNames, AgentStatus, RuleInfo } from '../api'
import { kindLabels, mostSevere } from '../labels'
import { A2aCardDialog } from './A2aCardDialog'
import { RoleChip, StatusBadge, Tag, Tags } from './chips'
import { Drawer, Field, Fields, Section } from './ui'

/** What makes these agents durable, as the demo shows it. */
const durableTraits: [string, string][] = [
  [
    'State survives the process',
    "Cases, rule results, human tasks and events live in the agent's own database. After a crash it restarts where it stopped; as the technical evaluator you can stop and restart agents on the left to show it.",
  ],
  [
    'It can wait a long time',
    'Approvals and field work are part of the rule graph. Waiting for a person holds no process; tasks have deadlines and are reissued when they expire.',
  ],
  [
    'Only what is affected is decided again',
    'Every result records the inputs it used. A change decides only the affected rules again, keeps the other results, and marks which change invalidated a result.',
  ],
  [
    'Every step is on record',
    'Every decision is kept as an event: the timeline shows who did what, when and why.',
  ],
  [
    'Models propose, people decide',
    "Transport planning's investigation helper runs on Pi Durable: every tool call is checkpointed and a crash resumes from the checkpoint. It has limits on calls and time, and it can only propose; a person confirms.",
  ],
]

function RoleChips({ roles, empty }: { roles: readonly Role[]; empty: string }) {
  if (roles.length === 0) return <span className="muted">{empty}</span>
  return (
    <span className="chips">
      {roles.map((role) => (
        <RoleChip key={role} forRole={role} />
      ))}
    </span>
  )
}

function peopleOf(rules: readonly RuleInfo[]): Role[] {
  return [
    ...new Set(
      rules.flatMap(
        (rule) => rule.definition.humanGate?.steps.map((step) => step.requiredRole) ?? [],
      ),
    ),
  ]
}

interface Props {
  agent: AgentStatus
  rules: RuleInfo[]
  agentNames: AgentNames
  outcomes: RuleOutcome[]
  onShowRules(): void
  onClose(): void
}

export function AgentCard({ agent, rules, agentNames, outcomes, onShowRules, onClose }: Props) {
  const owned = rules.filter((rule) => rule.owner === agent.agentId)
  const ownedIds = new Set(owned.map((rule) => rule.ruleId))
  const relations = agentRelations(rules)
  const name = (agentId: string) => agentNames[agentId] ?? agentId
  const summary = agent.summary
  const [cardOpen, setCardOpen] = useState(false)
  return (
    <>
      <Drawer
        onClose={onClose}
        heading={
          <>
            <span className={agent.available ? 'dot online' : 'dot offline'} />
            <h3>{agent.card?.name ?? agent.agentId}</h3>
            <Tag>Durable Jev Agent</Tag>
          </>
        }
      >
        <Section title="What it does">
          <p className="lead">{agent.card?.description}</p>
          <ul className="responsibilities">
            {agent.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
        <Section
          title={`Its rules (${owned.length})`}
          action={
            <button type="button" className="link-action" onClick={onShowRules}>
              Show its rule graph →
            </button>
          }
        >
          <div className="chips">
            {Object.entries(summary?.rulesByKind ?? {}).map(([kind, count]) => (
              <Tag key={kind}>
                {kindLabels[kind as keyof typeof kindLabels]} {count}
              </Tag>
            ))}
          </div>
        </Section>
        <Section title="Who it works with">
          <Fields>
            <Field label="People">
              <RoleChips roles={peopleOf(owned)} empty="None, every rule is automatic" />
            </Field>
            <Field label="Uses results from">
              <Tags
                items={relations
                  .filter((relation) => relation.to === agent.agentId)
                  .map((relation) => name(relation.from))}
              />
            </Field>
            <Field label="Gives results to">
              <Tags
                items={relations
                  .filter((relation) => relation.from === agent.agentId)
                  .map((relation) => name(relation.to))}
              />
            </Field>
          </Fields>
        </Section>
        <Section title="In this order">
          <Fields>
            <Field label="Its rules overall">
              <StatusBadge
                status={mostSevere(
                  outcomes
                    .filter((outcome) => ownedIds.has(outcome.ruleId))
                    .map((outcome) => outcome.status),
                )}
              />
            </Field>
            <Field label="Open tasks, all cases">
              {Object.keys(summary?.openTasksByRole ?? {}).length === 0 ? (
                <span className="muted">None</span>
              ) : (
                <span className="chips">
                  {Object.entries(summary?.openTasksByRole ?? {}).map(([role, count]) => (
                    <RoleChip key={role} forRole={role as Role} note={`${count}`} />
                  ))}
                </span>
              )}
            </Field>
          </Fields>
        </Section>
        <Section title="Running">
          <Fields>
            <Field label="Process">
              {agent.available
                ? 'Online'
                : 'Offline (it catches up on missed evaluations when back)'}
            </Field>
            <Field label="Transport">
              {agent.transport === 'a2a' ? `A2A (${agent.a2aTasks} tasks handled)` : 'Native HTTP'}
            </Field>
            {agent.card && (
              <Field label="Agent Card">
                <button
                  type="button"
                  className="chip link"
                  title="Show the A2A Agent Card"
                  onClick={() => setCardOpen(true)}
                >
                  {agent.card.url}/.well-known/agent-card.json
                </button>
              </Field>
            )}
          </Fields>
        </Section>
        <details className="explainer">
          <summary>What is a Durable Agent?</summary>
          <dl>
            {durableTraits.map(([title, text]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Drawer>
      {cardOpen && agent.card && (
        <A2aCardDialog
          agentId={agent.agentId}
          cardUrl={`${agent.card.url}/.well-known/agent-card.json`}
          onClose={() => setCardOpen(false)}
        />
      )}
    </>
  )
}
