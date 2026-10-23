import type { Actor, Investigation } from '../api'
import { checkStatusLabels } from '../labels'
import { Badge, Chip, InvestigationBadge, RoleChip, Tag } from './chips'
import { Field, Fields } from './ui'

const time = (timestamp: string) => `${timestamp.slice(5, 10)} ${timestamp.slice(11, 16)} UTC`

function Proposal({ proposal }: { proposal: NonNullable<Investigation['proposal']> }) {
  return (
    <>
      <Fields>
        <Field label="改派到">
          <Chip>{proposal.offerId}</Chip>
        </Field>
        <Field label="承运商">{proposal.carrierId}</Field>
        <Field label="车辆">{proposal.vehicleId}</Field>
        <Field label="计划出发">{time(proposal.plannedDeparture)}</Field>
        <Field label="计划到达">{time(proposal.plannedArrival)}</Field>
        <Field label="额外费用">€{(proposal.extraCostCents / 100).toFixed(2)}</Field>
        <Field label="规则预检">
          <span className="chips">
            {proposal.checks.map((check) => (
              <Badge
                key={`${check.ruleId}@${check.scope}`}
                tone={check.status}
                title={`${check.title}：${checkStatusLabels[check.status]}`}
              >
                {check.ruleId}
              </Badge>
            ))}
          </span>
        </Field>
      </Fields>
      <blockquote>
        <span className="quote-label">调查助手的理由</span>
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
              <strong>调查助手</strong>
              <Tag>运输计划 agent</Tag>
              <InvestigationBadge status={investigation.status} />
              <span className="muted">
                {investigation.incident.legId} 的承运商取消（资料版本 r{investigation.caseRevision}
                ）
              </span>
            </header>
            <p className="investigation-lead">
              {investigation.incident.legId}{' '}
              的承运商取消了。调查助手自己查资料、用规则试算备选方案，只能提建议；
              运输计划员确认之后订单才会改。
            </p>
            {investigation.status === 'RUNNING' && <p className="muted">调查中，步骤见时间线…</p>}
            {investigation.proposal && <Proposal proposal={investigation.proposal} />}
            {investigation.escalation && (
              <blockquote>
                <span className="quote-label">转人工的原因</span>
                {investigation.escalation}
              </blockquote>
            )}
            {investigation.decidedBy && (
              <Fields>
                <Field label="决定人">
                  <RoleChip forRole={investigation.decidedBy.role} />
                </Field>
              </Fields>
            )}
            {canDecide && (
              <div className="actions">
                <button type="button" onClick={() => onDecide(investigation, 'confirm')}>
                  确认改派
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDecide(investigation, 'reject')}
                >
                  否决
                </button>
              </div>
            )}
            {investigation.status === 'PROPOSED' && !canDecide && (
              <p className="muted">
                只有 <RoleChip forRole="transportPlanner" /> 能确认或否决这条提议。
              </p>
            )}
          </article>
        )
      })}
    </section>
  )
}
