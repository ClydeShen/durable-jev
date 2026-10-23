import type { CheckStatus, Role } from '@durable-jev/contracts'
import { Fragment, type ReactNode, useState } from 'react'
import type { TimelineEntry } from '../api'
import { checkStatusLabels, roleLabels } from '../labels'
import {
  fieldLabels,
  jevAnswer,
  scopeText,
  taskStatusLabels,
  technicalFields,
} from '../timeline-text'
import { Chip, RoleChip, StatusBadge } from './chips'

const isStatus = (value: unknown): value is CheckStatus =>
  typeof value === 'string' && value in checkStatusLabels

const isRole = (value: unknown): value is Role => typeof value === 'string' && value in roleLabels

/** A person who acted, such as a task's actor or the planner who confirmed: their role chip. */
const isPerson = (value: unknown): value is { role: Role } =>
  typeof value === 'object' && value !== null && isRole((value as { role?: unknown }).role)

/** Jev's answer: each option with how sure Jev is, as a bar. */
function Judgement({ judgement }: { judgement: unknown }) {
  const value = judgement as { probabilities?: Record<string, number> }
  if (!value.probabilities) return <>{jevAnswer(judgement)}</>
  return (
    <span className="judgement">
      {Object.entries(value.probabilities).map(([choice, probability]) => (
        <span key={choice} className="judgement-row">
          <span className="judgement-choice">{choice}</span>
          <span className="judgement-bar">
            <span style={{ width: `${probability * 100}%` }} />
          </span>
          <span className="muted">{probability}</span>
        </span>
      ))}
    </span>
  )
}

const readableTime = (value: unknown) =>
  new Date(String(value)).toLocaleString('en-GB', { hour12: false })

/** A list of records, such as the pre-checked rules: one compact row each. */
function RecordTable({ records }: { records: readonly Record<string, unknown>[] }) {
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))]
  return (
    <table className="record-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{fieldLabels[column] ?? column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((record) => (
          <tr key={JSON.stringify(record)}>
            {columns.map((column) => (
              <td key={column}>
                <Value name={column} value={record[column]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Payload fields whose value reads better in a particular form. */
const namedValues: Record<string, (value: unknown) => ReactNode> = {
  ruleId: (value) => <Chip>{String(value)}</Chip>,
  scope: scopeText,
  role: (value) => (isRole(value) ? <RoleChip forRole={value} /> : String(value)),
  durationMs: (value) => `${String(value)} ms`,
  extraCostCents: (value) => `€${Number(value) / 100}`,
  judgement: (value) => <Judgement judgement={value} />,
  at: (value) => readableTime(value),
  plannedDeparture: (value) => readableTime(value),
  plannedArrival: (value) => readableTime(value),
  status: (value) =>
    isStatus(value) ? (
      <StatusBadge status={value} />
    ) : (
      (taskStatusLabels[String(value)] ?? String(value))
    ),
}

/** Values that take a whole row of the grid: nested records, lists of records, long text. */
const isWide = (name: string, value: unknown) =>
  name === 'judgement' || name === 'rationale' || (typeof value === 'object' && value !== null)

function Value({ name, value }: { name: string; value: unknown }) {
  const named = namedValues[name]
  if (named) return <>{named(value)}</>
  if (isStatus(value)) return <StatusBadge status={value} />
  if (isPerson(value)) return <RoleChip forRole={value.role} />
  if (value === null || typeof value !== 'object') return <>{String(value)}</>
  if (Object.keys(value).length === 0) return <span className="muted">None</span>
  if (Array.isArray(value)) {
    return value.every((item) => typeof item !== 'object') ? (
      value.join(', ')
    ) : (
      <RecordTable records={value as Record<string, unknown>[]} />
    )
  }
  return <Facts payload={value as Record<string, unknown>} />
}

/** The fields a person reads, as a grid that fills the width; larger values take a full row. */
function Facts({ payload }: { payload: Record<string, unknown> }) {
  const fields = Object.entries(payload).filter(([name]) => !technicalFields.has(name))
  return (
    <div className="facts">
      {fields.map(([name, value]) => (
        <div key={name} className={isWide(name, value) && !isPerson(value) ? 'fact wide' : 'fact'}>
          <span className="fact-label">{fieldLabels[name] ?? name}</span>
          <span className="fact-value">
            <Value name={name} value={value} />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * One event, opened: first what happened, in the fields a person judges by; one more click shows
 * the technical record (identifiers, hashes, the raw event).
 */
export function EventDetail({ entry }: { entry: TimelineEntry }) {
  const [technical, setTechnical] = useState(false)
  const identifiers = Object.entries(entry.payload).filter(([name]) => technicalFields.has(name))
  return (
    <div className="event-detail-body">
      <Facts payload={entry.payload} />
      <button
        type="button"
        className="link-action"
        aria-expanded={technical}
        onClick={() => setTechnical(!technical)}
      >
        {technical ? '▾' : '▸'} Technical details
      </button>
      {technical && (
        <div className="technical-detail">
          <dl>
            <dt>Event</dt>
            <dd>
              <code>{entry.eventName}</code>
            </dd>
            <dt>Event ID</dt>
            <dd>
              <code>{entry.eventId}</code>
            </dd>
            <dt>From</dt>
            <dd>
              <code>{entry.agentId}</code>
            </dd>
            <dt>Time (UTC)</dt>
            <dd>
              <code>{entry.createdAt}</code>
            </dd>
            {identifiers.map(([name, value]) => (
              <Fragment key={name}>
                <dt>{name}</dt>
                <dd>
                  <code>{String(value)}</code>
                </dd>
              </Fragment>
            ))}
          </dl>
          <pre className="data">{JSON.stringify(entry.payload, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
