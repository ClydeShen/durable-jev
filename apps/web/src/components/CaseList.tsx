import type { CaseSummary } from '../api'
import { orderStatusLabels, roleLabels } from '../labels'

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
          <strong>{summary.caseId}</strong>
          <span className={`order-status ${summary.status}`}>
            {orderStatusLabels[summary.status]}
          </span>
          {summary.waitingOn.length > 0 && (
            <small>等待：{summary.waitingOn.map((role) => roleLabels[role]).join('、')}</small>
          )}
        </button>
      ))}
    </nav>
  )
}
