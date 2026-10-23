import type { Actor, Investigation } from '../api'
import { checkStatusLabels, moneyOf } from '../labels'
import { Badge, Chip, InvestigationBadge, RoleChip, Tag } from './chips'
import { Field, Fields } from './ui'

const time = (timestamp: string) => `${timestamp.slice(5, 10)} ${timestamp.slice(11, 16)} UTC`

function Proposal({ proposal }: { proposal: NonNullable<Investigation['proposal']> }) {
  return (
    <>
      <Fields>
        <Field label="Reroute to">
          <Chip>{proposal.offerId}</Chip>
        </Field>
        <Field label="Carrier">{proposal.carrierId}</Field>
        <Field label="Vehicle">{proposal.vehicleId}</Field>
        <Field label="Planned departure">{time(proposal.plannedDeparture)}</Field>
        <Field label="Planned arrival">{time(proposal.plannedArrival)}</Field>
        <Field label="Extra cost">{moneyOf(proposal.extraCostCents)}</Field>
        <Field label="Rule pre-checks">
          <span className="chips">
            {proposal.checks.map((check) => (
              <Badge
                key={`${check.ruleId}@${check.scope}`}
                tone={check.status}
                title={`${check.title}: ${checkStatusLabels[check.status]}`}
              >
                {check.ruleId}
              </Badge>
            ))}
          </span>
        </Field>
      </Fields>
      <blockquote>
        <span className="quote-label">The helper's reasoning</span>
        {proposal.rationale}
      </blockquote>
    </>
  )
}

interface Props {
  investigations: Investigation[]
  actor: Actor
  onDecide(investigation: Investigation, type: 'confirm' | 'reject'): void
}

export function InvestigationPanel({ investigations, actor, onDecide }: Props) {
  return (
    <section className="investigations">
      {investigations.map((investigation) => {
        const canDecide = investigation.status === 'PROPOSED' && actor.role === 'transportPlanner'
        return (
          <article key={investigation.investigationId} className="investigation">
            <header>
              <strong>Investigation helper</strong>
              <Tag>Transport planning agent</Tag>
              <InvestigationBadge status={investigation.status} />
              <span className="muted">
                Carrier of {investigation.incident.legId} cancelled (revision r
                {investigation.caseRevision})
              </span>
            </header>
            <p className="investigation-lead">
              The carrier of {investigation.incident.legId} cancelled. The helper looks things up
              and tries spare capacity against the rules by itself, but it can only propose; the
              order changes only once the transport planner confirms.
            </p>
            {investigation.status === 'RUNNING' && (
              <p className="muted">Investigating; the steps are in the timeline…</p>
            )}
            {investigation.proposal && <Proposal proposal={investigation.proposal} />}
            {investigation.escalation && (
              <blockquote>
                <span className="quote-label">Handed to a person because</span>
                {investigation.escalation}
              </blockquote>
            )}
            {investigation.decidedBy && (
              <Fields>
                <Field label="Decided by">
                  <RoleChip forRole={investigation.decidedBy.role} />
                </Field>
              </Fields>
            )}
            {canDecide && (
              <div className="actions">
                <button type="button" onClick={() => onDecide(investigation, 'confirm')}>
                  Confirm reroute
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDecide(investigation, 'reject')}
                >
                  Reject
                </button>
              </div>
            )}
            {investigation.status === 'PROPOSED' && !canDecide && (
              <p className="muted">
                Only the <RoleChip forRole="transportPlanner" /> can confirm or reject this
                proposal.
              </p>
            )}
          </article>
        )
      })}
    </section>
  )
}
