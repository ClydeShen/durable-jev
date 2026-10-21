import {
  markOutboxEventsPublished,
  readUnpublishedOutboxEvents,
  type StoreDatabase,
} from '@durable-jev/store'

export type RelayStatus = {
  published: number
  pending: number
  consecutiveFailures: number
  lastError?: string
}

export type RelayOptions = {
  database: StoreDatabase
  collectorUrl: string
  batchSize?: number
  timeoutMs?: number
  fetch?: typeof fetch
}

// Carries outbox events to the collector. A failure only delays delivery: the event stays in the
// outbox until the collector has accepted it, and the collector ignores repeats by eventId.
export class OutboxRelay {
  private readonly status: RelayStatus = { published: 0, pending: 0, consecutiveFailures: 0 }
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopped = true

  constructor(private readonly options: RelayOptions) {}

  async flush(): Promise<RelayStatus> {
    const { database, collectorUrl } = this.options
    const send = this.options.fetch ?? fetch
    for (;;) {
      const batch = readUnpublishedOutboxEvents(database, this.options.batchSize ?? 100)
      if (batch.length === 0) break
      try {
        const response = await send(new URL('/events', collectorUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ events: batch.map((event) => event.payload) }),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 3000),
        })
        if (!response.ok) throw new Error(`collector answered ${response.status}`)
        markOutboxEventsPublished(
          database,
          batch.map((event) => event.sequence),
        )
        this.status.published += batch.length
        this.status.consecutiveFailures = 0
        delete this.status.lastError
      } catch (error) {
        this.status.consecutiveFailures += 1
        this.status.lastError = error instanceof Error ? error.message : String(error)
        break
      }
    }
    this.status.pending = readUnpublishedOutboxEvents(database, 1_000_000).length
    return { ...this.status }
  }

  start(intervalMs = 500, maxBackoffMs = 10_000): void {
    this.stopped = false
    const tick = async () => {
      if (this.stopped) return
      await this.flush()
      const backoff = Math.min(intervalMs * 2 ** this.status.consecutiveFailures, maxBackoffMs)
      this.timer = setTimeout(tick, this.status.consecutiveFailures > 0 ? backoff : intervalMs)
      this.timer.unref()
    }
    this.timer = setTimeout(tick, 0)
    this.timer.unref()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
  }

  current(): RelayStatus {
    return { ...this.status }
  }
}
