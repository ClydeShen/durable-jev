import type { CaseSummary } from './api.js'
import { StatusBadge } from './StatusBadge.js'

export function CaseList(props: {
  cases: CaseSummary[]
  selectedCaseId: string | undefined
  onSelect: (caseId: string) => void
}) {
  if (props.cases.length === 0) {
    return <p className="muted">No cases yet. Click "Reset demo" to load the demo orders.</p>
  }
  return (
    <ul className="case-list">
      {props.cases.map((summary) => (
        <li key={summary.caseId}>
          <button
            type="button"
            className={summary.caseId === props.selectedCaseId ? 'selected' : ''}
            aria-current={summary.caseId === props.selectedCaseId ? 'true' : undefined}
            onClick={() => props.onSelect(summary.caseId)}
          >
            <span className="case-id">{summary.shipment.shipmentId}</span>
            <StatusBadge status={summary.orderStatus} />
            <span className="muted small">
              {summary.shipment.origin} → {summary.shipment.destination}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
