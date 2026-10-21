import type { StoredEvent } from '@durable-jev/contracts'
import { Icon } from '../icons.component.js'
import {
  categoryOf,
  describeEvent,
  describeSpan,
  formatDuration,
  isRecoveryEvent,
} from './console.model.js'

export function RecoveryDetail(props: {
  events: StoredEvent[]
  onOpenTrace: (traceId: string) => void
}) {
  const items = props.events
    .filter(({ event }) => isRecoveryEvent(event))
    .sort((left, right) => left.event.timestamp.localeCompare(right.event.timestamp))
  const start = Math.min(...props.events.map(({ event }) => Date.parse(event.timestamp)))
  return (
    <section>
      <h2>Recovery</h2>
      <p className="muted small">
        Interruptions, restarts, results that were voided by a change, and failures, with the traces
        that were linked together afterwards.
      </p>
      {items.length === 0 ? (
        <p className="muted">
          Nothing to recover from: no interruptions, restarts or failures were recorded.
        </p>
      ) : (
        <ol className="timeline">
          {items.map(({ event, sequence }) => (
            <li key={event.eventId} className="timeline-row timeline-recovery">
              <span className="timeline-time">
                +{formatDuration(Date.parse(event.timestamp) - start)}
              </span>
              <span className="timeline-kind">
                <Icon name="reset" /> {event.kind === 'span' ? 'Linked trace' : 'Recovery'}
              </span>
              <span className="timeline-what">
                {event.kind === 'event'
                  ? describeEvent(event)
                  : `${event.eventName} continues earlier work`}
                {event.errorCode && (
                  <span className="console-errors">
                    {' '}
                    <Icon name="error" /> {event.errorCode}
                  </span>
                )}
                {event.kind === 'span' &&
                  event.links?.map((link) => (
                    <button
                      key={link.spanId}
                      type="button"
                      className="link-button small"
                      onClick={() => props.onOpenTrace(link.traceId)}
                    >
                      <Icon name="link" size={12} /> {link.relation} {link.traceId.slice(0, 8)}
                    </button>
                  ))}
              </span>
              <span className="muted small timeline-service">
                {event.service}, event {sequence}
              </span>
              {event.kind === 'event' && categoryOf(event) === 'recovery' && event.traceId && (
                <button
                  type="button"
                  className="link-button small"
                  onClick={() => props.onOpenTrace(event.traceId as string)}
                >
                  <Icon name="link" size={12} /> trace
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
