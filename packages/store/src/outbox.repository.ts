import type { StoreDatabase } from './database.helpers.js'

export type OutboxEvent = {
  eventId: string
  eventType: string
  correlationId?: string
  payload: unknown
}

export type RecordedOutboxEvent = OutboxEvent & { sequence: number; recordedAt: string }

type OutboxRow = {
  sequence: number
  event_id: string
  event_type: string
  correlation_id: string | null
  payload_json: string
  recorded_at: string
}

export function appendOutboxEvent(database: StoreDatabase, event: OutboxEvent): void {
  database
    .prepare(
      `INSERT INTO outbox (event_id, event_type, correlation_id, payload_json, recorded_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (event_id) DO NOTHING`,
    )
    .run(
      event.eventId,
      event.eventType,
      event.correlationId ?? null,
      JSON.stringify(event.payload),
      new Date().toISOString(),
    )
}

export function readUnpublishedOutboxEvents(
  database: StoreDatabase,
  limit = 100,
): RecordedOutboxEvent[] {
  const rows = database
    .prepare('SELECT * FROM outbox WHERE published_at IS NULL ORDER BY sequence LIMIT ?')
    .all(limit) as OutboxRow[]
  return rows.map(toRecordedEvent)
}

export function markOutboxEventsPublished(
  database: StoreDatabase,
  sequences: readonly number[],
): void {
  const markPublished = database.prepare(
    'UPDATE outbox SET published_at = ? WHERE sequence = ? AND published_at IS NULL',
  )
  const publishedAt = new Date().toISOString()
  database.transaction(() => {
    for (const sequence of sequences) markPublished.run(publishedAt, sequence)
  })()
}

function toRecordedEvent(row: OutboxRow): RecordedOutboxEvent {
  return {
    sequence: row.sequence,
    eventId: row.event_id,
    eventType: row.event_type,
    ...(row.correlation_id === null ? {} : { correlationId: row.correlation_id }),
    payload: JSON.parse(row.payload_json),
    recordedAt: row.recorded_at,
  }
}
