import type { StoredEvent } from '@durable-jev/contracts'
import { useEffect } from 'react'
import { Icon } from '../icons.js'
import { buildTraces, formatDuration, spanRecords } from './console-model.js'

const shortId = (id: string) => id.slice(0, 8)

export function CallTree(props: {
  events: StoredEvent[]
  focusTrace: string | undefined
  onOpenTrace: (traceId: string) => void
}) {
  const traces = buildTraces(spanRecords(props.events))
  useEffect(() => {
    if (props.focusTrace) {
      document.getElementById(`trace-${props.focusTrace}`)?.scrollIntoView({ block: 'start' })
    }
  }, [props.focusTrace])

  if (traces.length === 0) {
    return (
      <section>
        <h2>Calls</h2>
        <p className="muted">No calls were recorded for this order yet.</p>
      </section>
    )
  }
  return (
    <section>
      <h2>Calls</h2>
      <p className="muted small">
        Each block is one trace: a continuous piece of work. Bars show when each call started and
        how long it ran, relative to the start of its trace. A late human answer or a resumed run is
        a separate trace that links back to the one it continues.
      </p>
      {traces.map((trace) => (
        <article
          key={trace.traceId}
          className={`trace${trace.traceId === props.focusTrace ? ' trace-focused' : ''}`}
          id={`trace-${trace.traceId}`}
        >
          <header className="trace-header">
            <strong>Trace {shortId(trace.traceId)}</strong>
            <span className="muted small">
              {new Date(trace.startedAt).toLocaleString('en-GB')} <span className="dot" />{' '}
              {formatDuration(trace.durationMs)}
            </span>
            {trace.links.map((link) => (
              <button
                key={`${link.fromSpanId}-${link.spanId}`}
                type="button"
                className="link-button small"
                onClick={() => props.onOpenTrace(link.traceId)}
              >
                <Icon name="link" size={12} /> {link.relation} trace {shortId(link.traceId)}
              </button>
            ))}
          </header>
          <ul className="spans">
            {trace.rows.map(({ span, depth, offsetMs, orphan }) => {
              const total = Math.max(trace.durationMs, 1)
              const duration = span.durationMs ?? 0
              return (
                <li key={span.spanId} className="span-row">
                  <span className="span-name" style={{ paddingLeft: `${depth * 16}px` }}>
                    {span.status === 'error' && <Icon name="error" />} {span.eventName}
                    {orphan && <span className="muted small"> (parent not recorded)</span>}
                    <span className="muted small"> {span.service}</span>
                    {span.a2aTaskId && <span className="tag"> A2A {shortId(span.a2aTaskId)}</span>}
                  </span>
                  <span className="span-bar-track" aria-hidden="true">
                    <span
                      className={`span-bar${span.status === 'error' ? ' span-bar-error' : ''}`}
                      style={{
                        marginLeft: `${(offsetMs / total) * 100}%`,
                        width: `${Math.max((duration / total) * 100, 0.8)}%`,
                      }}
                    />
                  </span>
                  <span className="span-duration small">{formatDuration(duration)}</span>
                </li>
              )
            })}
          </ul>
        </article>
      ))}
    </section>
  )
}
