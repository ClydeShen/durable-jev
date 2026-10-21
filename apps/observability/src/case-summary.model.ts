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
  // Time at least one person was being waited on, from the request until the answer; a request
  // not yet answered counts to the last event. Waits that overlap count once.
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

const eventTimes = (event: ObservabilityEvent): number[] =>
  event.kind === 'span' ? [ms(event.startedAt), ms(event.timestamp)] : [ms(event.timestamp)]

export function summarizeCase(events: readonly ObservabilityEvent[]): CaseSummary | undefined {
  // Services send their events independently, so arrival order is not time order.
  const ordered = [...events].sort((left, right) => ms(left.timestamp) - ms(right.timestamp))
  const first = ordered[0]
  const last = ordered.at(-1)
  if (!first || !last) return undefined
  const times = ordered.flatMap(eventTimes)
  const firstMs = Math.min(...times)
  const lastMs = Math.max(...times)
  const spanIntervals = ordered.flatMap((event): [number, number][] =>
    event.kind === 'span' && event.durationMs !== undefined
      ? [[ms(event.startedAt), ms(event.startedAt) + event.durationMs]]
      : [],
  )
  const requestedAt = new Map<string, number>()
  const waits: [number, number][] = []
  for (const event of ordered) {
    const taskId = event.attributes?.humanTaskId
    if (typeof taskId !== 'string') continue
    if (event.kind === 'event' && event.eventName === 'information.requested') {
      requestedAt.set(taskId, ms(event.timestamp))
    } else if (event.kind === 'event' && event.eventName === 'information.received') {
      const started = requestedAt.get(taskId)
      if (started !== undefined) waits.push([started, ms(event.timestamp)])
      requestedAt.delete(taskId)
    }
  }
  for (const started of requestedAt.values()) waits.push([started, lastMs])
  // Several people can be waited on at once; the time spent waiting counts once.
  const humanWaitMs = unionDurationMs(waits)

  const statusEvent = ordered.findLast(
    (event) => event.kind === 'event' && event.eventName === 'order.status_changed',
  )
  const orderStatus = statusEvent?.attributes?.to
  const lastBusiness = ordered.findLast((event) => event.kind === 'event') ?? last
  return {
    correlationId: first.correlationId,
    caseId: first.caseId,
    ...(typeof orderStatus === 'string' ? { orderStatus } : {}),
    eventCount: ordered.length,
    errorCount: ordered.filter((event) => event.severity === 'error').length,
    services: [...new Set(ordered.map((event) => event.service))].sort(),
    firstAt: new Date(firstMs).toISOString(),
    lastAt: new Date(lastMs).toISOString(),
    lastEventName: lastBusiness.eventName,
    totalMs: lastMs - firstMs,
    machineMs: unionDurationMs(spanIntervals),
    humanWaitMs,
  }
}
