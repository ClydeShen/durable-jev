import type { StoredEvent } from '@durable-jev/contracts'

// Adds incoming events to what is already shown. An event can arrive twice (a snapshot and the
// stream overlap, or the stream replays after a reconnect): it is kept once, in stream order.
export function mergeStored(
  current: readonly StoredEvent[],
  incoming: readonly StoredEvent[],
): StoredEvent[] {
  const known = new Set(current.map((stored) => stored.event.eventId))
  const added = incoming.filter((stored) => {
    if (known.has(stored.event.eventId)) return false
    known.add(stored.event.eventId)
    return true
  })
  return added.length === 0
    ? (current as StoredEvent[])
    : [...current, ...added].sort((left, right) => left.sequence - right.sequence)
}

// The highest sequence seen: where to continue from.
export const cursorOf = (events: readonly StoredEvent[], snapshotLatest = 0): number =>
  events.reduce((highest, stored) => Math.max(highest, stored.sequence), snapshotLatest)

export type StreamState = 'connecting' | 'live' | 'reconnecting'

export type StreamOptions = {
  after: number
  correlationId?: string | undefined
  onEvents: (events: StoredEvent[]) => void
  onState: (state: StreamState) => void
}

const silenceLimitMs = 12_000
const retryDelaysMs = [500, 1000, 2000, 5000]

// Follows the collector's event stream and reconnects by itself from the last sequence it saw.
// It does not rely on the browser's own reconnect: that gives up after an HTTP error (a dev proxy
// answers 502 while the collector is down) and cannot tell a dead stream from a quiet one. The
// server sends a ping every few seconds, so silence for longer than the limit means the stream is
// gone and a new one is opened.
export function openEventStream(options: StreamOptions): () => void {
  let cursor = options.after
  let source: EventSource | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let stopped = false

  const connect = () => {
    const params = new URLSearchParams({ after: String(cursor) })
    if (options.correlationId) params.set('correlationId', options.correlationId)
    const next = new EventSource(`/observe/stream?${params}`)
    source = next
    const hearFromServer = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(lost, silenceLimitMs)
    }
    const lost = () => {
      if (stopped || source !== next) return
      next.close()
      options.onState('reconnecting')
      clearTimeout(watchdog)
      retry = setTimeout(connect, retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)])
      attempt += 1
    }
    next.onopen = () => {
      attempt = 0
      options.onState('live')
      hearFromServer()
    }
    next.onerror = lost
    next.addEventListener('ping', hearFromServer)
    next.onmessage = (message) => {
      hearFromServer()
      const stored = JSON.parse(message.data) as StoredEvent
      cursor = Math.max(cursor, stored.sequence)
      options.onEvents([stored])
    }
  }

  options.onState('connecting')
  connect()
  return () => {
    stopped = true
    clearTimeout(watchdog)
    clearTimeout(retry)
    source?.close()
  }
}
