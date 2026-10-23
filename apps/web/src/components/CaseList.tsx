import type { CaseSummary } from '../api'
import { roleLabels } from '../labels'
import { OrderStatusBadge } from './chips'

interface Props {
  cases: CaseSummary[]
  selected?: string
  onSelect(caseId: string): void
  /** Opens the order entry point. */
  onNewOrder(): void
}

export function CaseList({ cases, selected, onSelect, onNewOrder }: Props) {
  return (
    <nav className="case-list">
      <div className="case-list-heading">
        <h2>Cases</h2>
        <button type="button" className="secondary small" onClick={onNewOrder}>
          + New order
        </button>
      </div>
      {cases.map((summary) => (
        <button
          type="button"
          key={summary.caseId}
          className={summary.caseId === selected ? 'case selected' : 'case'}
          onClick={() => onSelect(summary.caseId)}
        >
          <strong className="case-id">{summary.caseId}</strong>
          <span
            className="case-roles"
            role="img"
            aria-label={`Waits for ${summary.waitingOn.map((role) => roleLabels[role]).join(', ') || 'nobody'}`}
          >
            {summary.waitingOn.map((role) => (
              <span key={role} className="entity-dot" data-role={role} title={roleLabels[role]} />
            ))}
          </span>
          <OrderStatusBadge status={summary.status} />
        </button>
      ))}
    </nav>
  )
}
