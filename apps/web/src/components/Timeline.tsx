import type { CheckStatus, Role } from '@durable-jev/contracts'
import { Fragment, type ReactNode, useState } from 'react'
import type { AgentNames, TimelineEntry } from '../api'
import { checkStatusLabels, roleLabels } from '../labels'
import {
  eventLabels,
  fieldLabels,
  jevAnswer,
  scopeText,
  summary,
  taskStatusLabels,
  technicalFields,
} from '../timeline-text'
import { Chip, StatusBadge } from './ui'

const isStatus = (value: unknown): value is CheckStatus =>
  typeof value === 'string' && value in checkStatusLabels

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

/** Payload fields whose value reads better in a particular form. */
const namedValues: Record<string, (value: unknown) => ReactNode> = {
  ruleId: (value) => <Chip>{String(value)}</Chip>,
  scope: scopeText,
  role: (value) => roleLabels[value as Role] ?? String(value),
  durationMs: (value) => `${String(value)} ms`,
  extraCostCents: (value) => `€${Number(value) / 100}`,
  judgement: (value) => <Judgement judgement={value} />,
  status: (value) =>
    isStatus(value) ? (
      <StatusBadge status={value} />
    ) : (
      (taskStatusLabels[String(value)] ?? String(value))
    ),
}

function Value({ name, value }: { name: string; value: unknown }) {
  const named = namedValues[name]
  if (named) return <>{named(value)}</>
  if (isStatus(value)) return <StatusBadge status={value} />
  if (value === null || typeof value !== 'object') return <>{String(value)}</>
  if (Object.keys(value).length === 0) return <span className="muted">无</span>
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object')) {
    return <>{value.join('、')}</>
  }
  return <EventFields payload={value as Record<string, unknown>} />
}

/** The fields a person judges by, compact; identifiers and bookkeeping in one faint line. */
function EventFields({ payload }: { payload: Record<string, unknown> }) {
  const fields = Object.entries(payload).filter(([name]) => !technicalFields.has(name))
  const technical = Object.entries(payload).filter(([name]) => technicalFields.has(name))
  return (
    <div className="event-fields">
      <dl>
        {fields.map(([name, value]) => (
          <Fragment key={name}>
            <dt>{fieldLabels[name] ?? name}</dt>
            <dd>
              <Value name={name} value={value} />
            </dd>
          </Fragment>
        ))}
      </dl>
      {technical.length > 0 && (
        <p className="technical">
          {technical.map(([name, value]) => (
            <span key={name} title={String(value)}>
              {name} <code>{String(value)}</code>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

interface Props {
  entries: TimelineEntry[]
  agentNames: AgentNames
  titles: ReadonlyMap<string, string>
}

export function Timeline({ entries, agentNames, titles }: Props) {
  const [showRuleChanges, setShowRuleChanges] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (eventId: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(eventId)) next.add(eventId)
      return next
    })
  const visible = entries.filter((entry) => showRuleChanges || entry.eventName !== 'rule.evaluated')
  return (
    <section className="timeline">
      <label className="timeline-filter">
        <input
          type="checkbox"
          checked={showRuleChanges}
          onChange={(event) => setShowRuleChanges(event.target.checked)}
        />
        显示每条规则的状态变化
      </label>
      <table>
        <tbody>
          {visible.map((entry) => {
            const expanded = open.has(entry.eventId)
            return (
              <Fragment key={entry.eventId}>
                <tr
                  className={expanded ? 'event open' : 'event'}
                  onClick={() => toggle(entry.eventId)}
                >
                  <td className="toggle">{expanded ? '▾' : '▸'}</td>
                  <td className="time">
                    {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}
                  </td>
                  <td>
                    <span className={`agent-chip ${entry.agentId}`}>
                      {agentNames[entry.agentId] ?? entry.agentId}
                    </span>
                  </td>
                  <td className="event-label" title={entry.eventName}>
                    {eventLabels[entry.eventName] ?? entry.eventName}
                  </td>
                  <td className="event-summary">{summary(entry, titles)}</td>
                </tr>
                {expanded && (
                  <tr className="event-detail">
                    <td colSpan={5}>
                      <EventFields payload={entry.payload} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
