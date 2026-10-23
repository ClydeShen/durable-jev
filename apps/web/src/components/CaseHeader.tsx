import type { Actor, CaseDetail } from '../api'
import { countOf } from '../labels'
import { OrderStatusBadge, RoleChip } from './chips'

interface Props {
  detail: CaseDetail
  actor: Actor
  onDispatch(): void
  onRevise(index: number): void
  onReportIncident(index: number): void
  onReset(): void
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

export function CaseHeader({
  detail,
  actor,
  onDispatch,
  onRevise,
  onReportIncident,
  onReset,
}: Props) {
  const canDispatch = actor.role === 'dispatcher' && detail.status === 'READY_TO_DISPATCH'
  const open = detail.status !== 'DISPATCHED'
  const nextRevision = detail.revisions.find((revision) => !revision.applied)
  const nextIncident = detail.incidents[detail.investigations.length]
  return (
    <section className="case-header">
      <div className="case-title">
        <h2>{detail.caseId}</h2>
        <OrderStatusBadge status={detail.status} />
        <div className="case-title-actions">
          {canDispatch && (
            <button type="button" className="primary-action" onClick={onDispatch}>
              Confirm dispatch
            </button>
          )}
          <button
            type="button"
            className="secondary small case-reset"
            title="Returns only this case to the moment its order arrived and plays it again from the first rule; other cases stay as they are"
            onClick={onReset}
          >
            ↺ Reset this case
          </button>
        </div>
      </div>
      <p className="story">{detail.story}</p>
      <div className="case-facts">
        <Stat label="Revision" value={`r${detail.caseRevision}`} />
        <Stat label="Cargo" value={countOf(detail.shipment.cargoItems.length, 'item')} />
        <Stat label="Legs" value={`${detail.shipment.legs.length}`} />
        <div className="stat">
          <span className="stat-value chips">
            {detail.waitingOn.length === 0
              ? '—'
              : detail.waitingOn.map((role) => <RoleChip key={role} forRole={role} />)}
          </span>
          <span className="stat-label">Waiting for</span>
        </div>
        {open && (nextRevision || nextIncident) && (
          <div className="demo-actions">
            <span className="stat-label">Demo actions</span>
            {nextRevision && (
              <button
                type="button"
                className="secondary small"
                onClick={() => onRevise(nextRevision.index)}
              >
                Change the order: {nextRevision.label}
              </button>
            )}
            {nextIncident && (
              <button
                type="button"
                className="secondary small"
                title="Simulates a mishap: the transport planning agent starts its investigation helper, which proposes a replacement for the transport planner to confirm"
                onClick={() => onReportIncident(nextIncident.index)}
              >
                Incident: {nextIncident.label}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
