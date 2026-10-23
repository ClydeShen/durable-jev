import type { CaseSummary } from '../api'
import { OrderStatusBadge, RoleLabel } from './chips'

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
          <span className="case-line">
            <strong>{summary.caseId}</strong>
            <OrderStatusBadge status={summary.status} />
          </span>
          {summary.waitingOn.length > 0 && (
            <span className="case-waiting">
              <span className="stat-label">Awaits</span>
              {summary.waitingOn.map((role) => (
                <RoleLabel key={role} forRole={role} />
              ))}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
