import type Database from 'better-sqlite3'

export type Migration = { id: string; sql: string }

export const coreMigrations: readonly Migration[] = [
  {
    id: 'core-001-operations',
    sql: `CREATE TABLE operations (
      operation_id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      request_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  },
  {
    id: 'core-002-outbox',
    sql: `CREATE TABLE outbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      correlation_id TEXT,
      payload_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      published_at TEXT
    )`,
  },
]

export function runMigrations(database: Database.Database, migrations: readonly Migration[]) {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  const isApplied = database.prepare('SELECT 1 FROM schema_migrations WHERE id = ?')
  const recordApplied = database.prepare(
    'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
  )
  const applyPending = database.transaction(() => {
    for (const migration of migrations) {
      if (isApplied.get(migration.id)) continue
      database.exec(migration.sql)
      recordApplied.run(migration.id, new Date().toISOString())
    }
  })
  applyPending()
}
