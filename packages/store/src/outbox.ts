import { randomUUID } from 'node:crypto'
import type { Db } from './database.js'

export interface OutboxEventDraft {
  eventId?: string
  caseId?: string
  eventName: string
  payload: unknown
}

export interface OutboxEvent {
  sequence: number
  eventId: string
  caseId?: string
  eventName: string
  payload: unknown
  createdAt: string
}

interface OutboxRow {
  sequence: number
  event_id: string
  case_id: string | null
  event_name: string
  payload_json: string
  created_at: string
}

export function appendToOutbox(db: Db, event: OutboxEventDraft): string {
  const eventId = event.eventId ?? randomUUID()
  db.prepare(
    'INSERT INTO outbox (event_id, case_id, event_name, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    eventId,
    event.caseId ?? null,
    event.eventName,
    JSON.stringify(event.payload),
    new Date().toISOString(),
  )
  return eventId
}

export function unpublishedEvents(db: Db, limit = 100): OutboxEvent[] {
  return db
    .prepare<[number], OutboxRow>(
      'SELECT sequence, event_id, case_id, event_name, payload_json, created_at FROM outbox WHERE published_at IS NULL ORDER BY sequence LIMIT ?',
    )
    .all(limit)
    .map((row) => ({
      sequence: row.sequence,
      eventId: row.event_id,
      ...(row.case_id === null ? {} : { caseId: row.case_id }),
      eventName: row.event_name,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }))
}

export function markPublished(db: Db, eventIds: readonly string[]): void {
  const mark = db.prepare(
    'UPDATE outbox SET published_at = ? WHERE event_id = ? AND published_at IS NULL',
  )
  const publishedAt = new Date().toISOString()
  db.transaction(() => {
    for (const eventId of eventIds) mark.run(publishedAt, eventId)
  })()
}
