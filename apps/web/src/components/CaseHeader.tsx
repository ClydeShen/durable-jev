import type { Actor, CaseDetail } from '../api'
import { orderStatusLabels } from '../labels'

interface Props {
  detail: CaseDetail
  actor: Actor
  onDispatch(): void
}

export function CaseHeader({ detail, actor, onDispatch }: Props) {
  const canDispatch = actor.role === 'dispatcher' && detail.status === 'READY_TO_DISPATCH'
  return (
    <section className="case-header">
      <div>
        <h2>
          {detail.caseId}{' '}
          <span className={`order-status ${detail.status}`}>
            {orderStatusLabels[detail.status]}
          </span>
        </h2>
        <p>{detail.story}</p>
        <small>
          资料版本 r{detail.caseRevision} · {detail.shipment.cargoItems.length} 件货物 ·{' '}
          {detail.shipment.legs.length} 个运输段
        </small>
      </div>
      {canDispatch && (
        <button type="button" onClick={onDispatch}>
          确认发运
        </button>
      )}
    </section>
  )
}
