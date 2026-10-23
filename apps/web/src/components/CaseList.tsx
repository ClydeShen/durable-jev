import type { CaseSummary } from '../api'
import { countOf, roleLabels } from '../labels'
import { OrderStatusBadge } from './chips'
import { IconButton } from './ui'

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
        <IconButton icon="add" label="New order" onClick={onNewOrder} />
      </div>
      {cases.map((summary) => (
        <button
          type="button"
          key={summary.caseId}
          className={summary.caseId === selected ? 'case selected' : 'case'}
          onClick={() => onSelect(summary.caseId)}
        >
          <strong className="case-id">{summary.caseId}</strong>
          <OrderStatusBadge status={summary.status} />
          <span className="case-roles">
            {summary.waitingOn.map((role) => (
              <span key={role} className="entity-dot" data-role={role} title={roleLabels[role]} />
            ))}
            <span className="case-roles-count">
              {summary.waitingOn.length > 0
                ? `Waiting on ${countOf(summary.waitingOn.length, 'role')}`
                : 'No open tasks'}
            </span>
          </span>
        </button>
      ))}
    </nav>
  )
}
