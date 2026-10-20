import type { ObservabilityEvent } from '@durable-jev/contracts'

export type CaseSummary = {
  correlationId: string
  caseId: string
  orderStatus?: string
  eventCount: number
  errorCount: number
  services: string[]
  firstAt: string
  lastAt: string
  lastEventName: string
  // Wall clock from the first to the last event.
  totalMs: number
  // Time at least one span was running. Parallel spans are counted once, and waiting for a
  // person is not machine time.
  machineMs: number
  // Time from a request to a person until their answer; an answer not yet given counts to the
  // last event.
  humanWaitMs: number
}

const ms = (timestamp: string) => Date.parse(timestamp)

export function unionDurationMs(intervals: readonly [number, number][]): number {
  const sorted = [...intervals].sort((left, right) => left[0] - right[0])
  let total = 0
  let currentEnd = Number.NEGATIVE_INFINITY
  for (const [start, end] of sorted) {
    if (end <= currentEnd) continue
    total += end - Math.max(start, currentEnd)
    currentEnd = end
  }
  return total
}

export function summarizeCase(events: readonly ObservabilityEvent[]): CaseSummary | undefined {
  const first = events[0]
  const last = events.at(-1)
  if (!first || !last) return undefined
  const spanIntervals = events.flatMap((event): [number, number][] =>
    event.kind === 'span' && event.durationMs !== undefined
      ? [[ms(event.startedAt), ms(event.startedAt) + event.durationMs]]
      : [],
  )
  const requestedAt = new Map<string, number>()
  let humanWaitMs = 0
  for (const event of events) {
    const taskId = event.attributes?.humanTaskId
    if (typeof taskId !== 'string') continue
    if (event.kind === 'event' && event.eventName === 'information.requested') {
      requestedAt.set(taskId, ms(event.timestamp))
    } else if (event.kind === 'event' && event.eventName === 'information.received') {
      const started = requestedAt.get(taskId)
      if (started !== undefined) humanWaitMs += ms(event.timestamp) - started
      requestedAt.delete(taskId)
    }
  }
  for (const started of requestedAt.values()) humanWaitMs += ms(last.timestamp) - started

  const statusEvent = events.findLast(
    (event) => event.kind === 'event' && event.eventName === 'order.status_changed',
  )
  const orderStatus = statusEvent?.attributes?.to
  const lastBusiness = events.findLast((event) => event.kind === 'event') ?? last
  return {
    correlationId: first.correlationId,
    caseId: first.caseId,
    ...(typeof orderStatus === 'string' ? { orderStatus } : {}),
    eventCount: events.length,
    errorCount: events.filter((event) => event.severity === 'error').length,
    services: [...new Set(events.map((event) => event.service))].sort(),
    firstAt: first.timestamp,
    lastAt: last.timestamp,
    lastEventName: lastBusiness.eventName,
    totalMs: ms(last.timestamp) - ms(first.timestamp),
    machineMs: unionDurationMs(spanIntervals),
    humanWaitMs,
  }
}
