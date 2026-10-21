import type { AgentClient } from '@durable-jev/agent-core'
import {
  type Db,
  type Migration,
  migrate,
  type OutboxEvent,
  openDatabase,
} from '@durable-jev/store'

const eventLogMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'collected events',
    sql: `
      CREATE TABLE events (
        event_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        case_id TEXT,
        event_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX events_by_case ON events (case_id, created_at);
    `,
  },
]

export interface TimelineEntry {
  eventId: string
  agentId: string
  eventName: string
  payload: unknown
  createdAt: string
}

interface EventRow {
  event_id: string
  agent_id: string
  event_name: string
  payload_json: string
  created_at: string
}

export class EventLog {
  private constructor(private readonly db: Db) {}

  static open(path: string): EventLog {
    const db = openDatabase(path)
    migrate(db, eventLogMigrations)
    return new EventLog(db)
  }

  append(agentId: string, events: readonly OutboxEvent[]) {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO events (event_id, agent_id, case_id, event_name, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      for (const event of events) {
        insert.run(
          event.eventId,
          agentId,
          event.caseId ?? null,
          event.eventName,
          JSON.stringify(event.payload),
          event.createdAt,
        )
      }
    })()
  }

  timeline(caseId: string): TimelineEntry[] {
    return this.db
      .prepare<[string], EventRow>(
        'SELECT event_id, agent_id, event_name, payload_json, created_at FROM events WHERE case_id = ? ORDER BY created_at, rowid',
      )
      .all(caseId)
      .map((row) => ({
        eventId: row.event_id,
        agentId: row.agent_id,
        eventName: row.event_name,
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at,
      }))
  }

  clear() {
    this.db.exec('DELETE FROM events')
  }
}

export function collectEvents(agents: readonly AgentClient[], log: EventLog, intervalMs = 1000) {
  const collect = async (agent: AgentClient) => {
    const events = await agent.events()
    if (events.length === 0) return
    log.append(agent.agentId, events)
    await agent.acknowledgeEvents(events.map((event) => event.eventId))
  }
  const timer = setInterval(() => {
    for (const agent of agents) collect(agent).catch(() => undefined)
  }, intervalMs)
  timer.unref()
}
