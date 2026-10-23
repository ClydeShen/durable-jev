import { Fragment, useState } from 'react'
import type { AgentNames, TimelineEntry } from '../api'
import { eventLabels, summary } from '../timeline-text'
import { AgentChip } from './chips'
import { EventDetail } from './EventDetail'

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
        Show every rule's status change
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
                  <td className="toggle">
                    <button
                      type="button"
                      className="node-open"
                      aria-expanded={expanded}
                      aria-label={`${eventLabels[entry.eventName] ?? entry.eventName}: ${summary(entry, titles)}, ${expanded ? 'hide' : 'show'} details`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(entry.eventId)
                      }}
                    >
                      {expanded ? '▾' : '▸'}
                    </button>
                  </td>
                  <td className="time">
                    {new Date(entry.createdAt).toLocaleTimeString('en-GB', { hour12: false })}
                  </td>
                  <td>
                    <AgentChip
                      agentId={entry.agentId}
                      name={agentNames[entry.agentId] ?? entry.agentId}
                    />
                  </td>
                  <td className="event-label" title={entry.eventName}>
                    {eventLabels[entry.eventName] ?? entry.eventName}
                  </td>
                  <td className="event-summary">{summary(entry, titles)}</td>
                </tr>
                {expanded && (
                  <tr className="event-detail">
                    <td colSpan={5}>
                      <EventDetail entry={entry} />
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
