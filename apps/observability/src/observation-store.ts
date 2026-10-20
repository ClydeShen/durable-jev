import { ObservabilityEvent, type StoredEvent } from '@durable-jev/contracts'
import type { Migration, StoreDatabase } from '@durable-jev/store'

export const observationMigrations: readonly Migration[] = [
  {
    id: 'observation-001-events',
    sql: `CREATE TABLE events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      event_name TEXT NOT NULL,
      service TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      trace_id TEXT,
      span_id TEXT,
      timestamp TEXT NOT NULL,
      event_json TEXT NOT NULL
    );
    CREATE INDEX events_by_correlation ON events (correlation_id, sequence);
    CREATE INDEX events_by_trace ON events (trace_id, sequence);`,
  },
]

export type EventQuery = {
  correlationId?: string
  caseId?: string
  service?: string
  kind?: 'event' | 'span'
  eventName?: string
  traceId?: string
  // Stream cursor: only events stored after this sequence.
  after?: number
  limit?: number
}

export type IngestResult = {
  accepted: string[]
  duplicates: string[]
  rejected: { index: number; issues: unknown }[]
}

type EventRow = { sequence: number; event_json: string }

export class ObservationStore {
  constructor(private readonly database: StoreDatabase) {}

  // Idempotent by eventId: a relay that resends after a lost response changes nothing.
  ingest(candidates: readonly unknown[]): IngestResult {
    const result: IngestResult = { accepted: [], duplicates: [], rejected: [] }
    const insert = this.database.prepare(
      `INSERT INTO events (event_id, kind, event_name, service, correlation_id, case_id, trace_id, span_id, timestamp, event_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (event_id) DO NOTHING`,
    )
    this.database
      .transaction(() => {
        candidates.forEach((candidate, index) => {
          const parsed = ObservabilityEvent.safeParse(candidate)
          if (!parsed.success) {
            result.rejected.push({ index, issues: parsed.error.issues })
            return
          }
          const event = parsed.data
          const inserted = insert.run(
            event.eventId,
            event.kind,
            event.eventName,
            event.service,
            event.correlationId,
            event.caseId,
            event.traceId ?? null,
            event.spanId ?? null,
            event.timestamp,
            JSON.stringify(event),
          ).changes
          ;(inserted === 1 ? result.accepted : result.duplicates).push(event.eventId)
        })
      })
      .immediate()
    return result
  }

  list(query: EventQuery = {}): StoredEvent[] {
    const clauses: string[] = []
    const values: (string | number)[] = []
    const add = (column: string, value: string | number | undefined, operator = '=') => {
      if (value === undefined) return
      clauses.push(`${column} ${operator} ?`)
      values.push(value)
    }
    add('correlation_id', query.correlationId)
    add('case_id', query.caseId)
    add('service', query.service)
    add('kind', query.kind)
    add('event_name', query.eventName)
    add('trace_id', query.traceId)
    add('sequence', query.after, '>')
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.database
      .prepare(`SELECT sequence, event_json FROM events ${where} ORDER BY sequence LIMIT ?`)
      .all(...values, query.limit ?? 1000) as EventRow[]
    return rows.map((row) => ({
      sequence: row.sequence,
      event: ObservabilityEvent.parse(JSON.parse(row.event_json)),
    }))
  }

  latestSequence(): number {
    const row = this.database
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS latest FROM events')
      .get() as {
      latest: number
    }
    return row.latest
  }

  correlationIds(): string[] {
    const rows = this.database
      .prepare(
        'SELECT correlation_id FROM events GROUP BY correlation_id ORDER BY MAX(sequence) DESC',
      )
      .all() as { correlation_id: string }[]
    return rows.map((row) => row.correlation_id)
  }
}
