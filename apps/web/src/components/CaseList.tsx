import type { CaseSummary } from '../api'
import { OrderStatusBadge, RoleLabel } from './chips'

interface Props {
  cases: CaseSummary[]
  selected?: string
  onSelect(caseId: string): void
}

export function CaseList({ cases, selected, onSelect }: Props) {
  return (
    <nav className="case-list">
      <h2>案例</h2>
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
              <span className="stat-label">等</span>
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
