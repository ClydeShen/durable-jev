import { useMemo, useState } from 'react'
import { Icon } from '../icons.component.js'
import { StatusBadge } from '../status-badge.component.js'
import { type CaseSummary, formatDuration } from './console.model.js'

export function CaseTable(props: {
  cases: CaseSummary[]
  onOpen: (correlationId: string) => void
}) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [service, setService] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)

  const statuses = useMemo(
    () =>
      [
        ...new Set(
          props.cases.flatMap((summary) => (summary.orderStatus ? [summary.orderStatus] : [])),
        ),
      ].sort(),
    [props.cases],
  )
  const services = useMemo(
    () => [...new Set(props.cases.flatMap((summary) => summary.services))].sort(),
    [props.cases],
  )
  const shown = props.cases.filter(
    (summary) =>
      (!text ||
        `${summary.correlationId} ${summary.caseId}`.toLowerCase().includes(text.toLowerCase())) &&
      (!status || summary.orderStatus === status) &&
      (!service || summary.services.includes(service)) &&
      (!errorsOnly || summary.errorCount > 0),
  )

  return (
    <section>
      <h2>Cases</h2>
      <div className="console-filters">
        <label>
          Find
          <input
            value={text}
            placeholder="case or correlation id"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">any</option>
            {statuses.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select value={service} onChange={(event) => setService(event.target.value)}>
            <option value="">any</option>
            {services.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => setErrorsOnly(event.target.checked)}
          />
          errors only
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="muted">
          {props.cases.length === 0
            ? 'No events yet. Load the demo orders with "Reset demo" in the workbench.'
            : 'No case matches these filters.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="console-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Services</th>
                <th title="First to last event">Total</th>
                <th title="Time at least one call was running; parallel calls count once">
                  Machine
                </th>
                <th title="Waiting for a person; not machine time">Human wait</th>
                <th>Events</th>
                <th>Errors</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((summary) => (
                <tr key={summary.correlationId}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => props.onOpen(summary.correlationId)}
                    >
                      {summary.caseId}
                    </button>
                    <div className="muted small">{summary.correlationId}</div>
                  </td>
                  <td>
                    {summary.orderStatus ? (
                      <StatusBadge status={summary.orderStatus as never} />
                    ) : (
                      <span className="muted">unknown</span>
                    )}
                  </td>
                  <td className="small">{summary.services.join(', ')}</td>
                  <td>{formatDuration(summary.totalMs)}</td>
                  <td>{formatDuration(summary.machineMs)}</td>
                  <td>{formatDuration(summary.humanWaitMs)}</td>
                  <td>{summary.eventCount}</td>
                  <td>
                    {summary.errorCount > 0 ? (
                      <span className="console-errors">
                        <Icon name="error" /> {summary.errorCount}
                      </span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td className="small">
                    {new Date(summary.lastAt).toLocaleString('en-GB')}
                    <div className="muted">{summary.lastEventName}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
