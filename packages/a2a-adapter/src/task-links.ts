import type { Migration, StoreDatabase } from '@durable-jev/store'

// Coordinator side of FR-18: which A2A task answers which business request, so a restart or a
// retry finds the existing task instead of delegating again.
export const a2aClientMigrations: readonly Migration[] = [
  {
    id: 'a2a-client-001-task-links',
    sql: `CREATE TABLE a2a_task_links (
      request_key TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      case_revision INTEGER NOT NULL,
      capability TEXT NOT NULL,
      message_id TEXT NOT NULL,
      a2a_task_id TEXT,
      state TEXT NOT NULL,
      previous_task_ids_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`,
  },
]

export type TaskLink = {
  requestKey: string
  caseId: string
  caseRevision: number
  capability: string
  messageId: string
  a2aTaskId?: string
  state: string
  previousTaskIds: string[]
}

type LinkRow = {
  request_key: string
  case_id: string
  case_revision: number
  capability: string
  message_id: string
  a2a_task_id: string | null
  state: string
  previous_task_ids_json: string
}

const toLink = (row: LinkRow): TaskLink => ({
  requestKey: row.request_key,
  caseId: row.case_id,
  caseRevision: row.case_revision,
  capability: row.capability,
  messageId: row.message_id,
  ...(row.a2a_task_id ? { a2aTaskId: row.a2a_task_id } : {}),
  state: row.state,
  previousTaskIds: JSON.parse(row.previous_task_ids_json),
})

export class A2aTaskLinks {
  constructor(private readonly database: StoreDatabase) {}

  find(requestKey: string): TaskLink | undefined {
    const row = this.database
      .prepare('SELECT * FROM a2a_task_links WHERE request_key = ?')
      .get(requestKey) as LinkRow | undefined
    return row && toLink(row)
  }

  forCase(caseId: string): TaskLink[] {
    const rows = this.database
      .prepare('SELECT * FROM a2a_task_links WHERE case_id = ? ORDER BY rowid')
      .all(caseId) as LinkRow[]
    return rows.map(toLink)
  }

  save(link: TaskLink): void {
    this.database
      .prepare(
        `INSERT INTO a2a_task_links (request_key, case_id, case_revision, capability, message_id,
           a2a_task_id, state, previous_task_ids_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (request_key) DO UPDATE SET message_id = excluded.message_id,
           a2a_task_id = excluded.a2a_task_id, state = excluded.state,
           previous_task_ids_json = excluded.previous_task_ids_json, updated_at = excluded.updated_at`,
      )
      .run(
        link.requestKey,
        link.caseId,
        link.caseRevision,
        link.capability,
        link.messageId,
        link.a2aTaskId ?? null,
        link.state,
        JSON.stringify(link.previousTaskIds),
        new Date().toISOString(),
      )
  }
}
