import type { Actor, CaseDetail } from '../api'
import { countOf } from '../labels'
import { OrderStatusBadge, RoleChip } from './chips'
import { DemoActions } from './DemoActions'
import { IconButton } from './ui'

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
          <IconButton icon="reset" label="Reset this case" onClick={onReset} />
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
        <DemoActions detail={detail} onRevise={onRevise} onReportIncident={onReportIncident} />
      </div>
    </section>
  )
}
