import type { BusinessEvent, StoredEvent } from '@durable-jev/contracts'
import { useState } from 'react'
import { Icon, type IconName } from '../icons.component.js'
import { StatusBadge } from '../status-badge.component.js'
import {
  businessEvents,
  categoryLabels,
  categoryOf,
  describeEvent,
  type EventCategory,
  formatDuration,
  groupTimeline,
} from './console.model.js'

const categoryIcons: Record<EventCategory, IconName> = {
  code: 'code',
  jev: 'jev',
  tool: 'tool',
  service: 'service',
  human: 'waiting',
  agent: 'agent',
  recovery: 'reset',
  order: 'dispatched',
}

const categories = Object.keys(categoryLabels) as EventCategory[]

export const Timeline = (props: {
  events: StoredEvent[]
  highlightRule: string | undefined
  onOpenTrace: (traceId: string) => void
}) => {
  const [hidden, setHidden] = useState<ReadonlySet<EventCategory>>(new Set())
  const all = businessEvents(props.events)
  const visible = all.filter((event) => !hidden.has(categoryOf(event)))
  const start = all[0] ? Date.parse(all[0].timestamp) : 0
  const present = new Set(all.map(categoryOf))

  const toggle = (category: EventCategory) =>
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })

  const row = (event: BusinessEvent) => {
    const category = categoryOf(event)
    const highlighted =
      props.highlightRule !== undefined && event.attributes?.ruleId === props.highlightRule
    return (
      <li
        key={event.eventId}
        className={`timeline-row timeline-${category}${highlighted ? ' timeline-highlight' : ''}`}
      >
        <span className="timeline-time" title={event.timestamp}>
          +{formatDuration(Date.parse(event.timestamp) - start)}
        </span>
        <span className="timeline-kind">
          <Icon name={categoryIcons[category]} /> {categoryLabels[category]}
        </span>
        <span className="timeline-what">
          {describeEvent(event)}
          {event.status && event.eventName === 'rule.evaluated' && (
            <>
              {' '}
              <StatusBadge status={event.status as never} />
            </>
          )}
          {event.errorCode && (
            <span className="console-errors">
              {' '}
              <Icon name="error" /> {event.errorCode}
            </span>
          )}
        </span>
        <span className="muted small timeline-service">
          {event.service}
          {event.caseRevision ? ` r${event.caseRevision}` : ''}
        </span>
        {event.traceId ? (
          <button
            type="button"
            className="link-button small"
            title="Open the call that produced this event"
            onClick={() => props.onOpenTrace(event.traceId as string)}
          >
            <Icon name="link" size={12} /> trace
          </button>
        ) : (
          <span />
        )}
      </li>
    )
  }

  return (
    <section>
      <h2>Timeline</h2>
      <p className="muted small">
        Everything that happened to this order, in time order. The icon says what kind of actor did
        it. Rule results that arrived together are folded into one row.
      </p>
      <fieldset className="chips">
        <legend className="visually-hidden">Show event kinds</legend>
        {categories
          .filter((category) => present.has(category))
          .map((category) => (
            <button
              key={category}
              type="button"
              className="chip"
              aria-pressed={!hidden.has(category)}
              onClick={() => toggle(category)}
            >
              <Icon name={categoryIcons[category]} size={12} /> {categoryLabels[category]}
            </button>
          ))}
      </fieldset>
      <ol className="timeline">
        {groupTimeline(visible).map((item) => {
          if (item.kind === 'event') return row(item.event)
          const first = item.events[0] as BusinessEvent
          const highlighted =
            props.highlightRule !== undefined &&
            item.events.some((event) => event.attributes?.ruleId === props.highlightRule)
          return (
            <li
              key={first.eventId}
              className={`timeline-group${highlighted ? ' timeline-highlight' : ''}`}
            >
              <details open={highlighted}>
                <summary>
                  <span className="timeline-time">
                    +{formatDuration(Date.parse(first.timestamp) - start)}
                  </span>{' '}
                  <Icon name="code" /> {item.events.length} rule results:{' '}
                  {Object.entries(item.counts)
                    .map(
                      ([status, count]) => `${count} ${status.toLowerCase().replaceAll('_', ' ')}`,
                    )
                    .join(', ')}
                </summary>
                <ol className="timeline">{item.events.map(row)}</ol>
              </details>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
