import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export type Db = Database.Database

export interface Migration {
  version: number
  name: string
  sql: string
}

export const storeMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'operations and outbox',
    sql: `
      CREATE TABLE operations (
        operation_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE outbox (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        case_id TEXT,
        event_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT
      );
      CREATE INDEX outbox_unpublished ON outbox (sequence) WHERE published_at IS NULL;
    `,
  },
]

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

export function migrate(db: Db, migrations: readonly Migration[]): number[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  )
  const applied = new Set(
    db
      .prepare<[], { version: number }>('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  )
  const pending = [...migrations]
    .sort((left, right) => left.version - right.version)
    .filter((migration) => !applied.has(migration.version))
  const record = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  )
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql)
      record.run(migration.version, migration.name, new Date().toISOString())
    })()
  }
  return pending.map((migration) => migration.version)
}

export function openStore(path: string, serviceMigrations: readonly Migration[] = []): Db {
  const db = openDatabase(path)
  migrate(db, [...storeMigrations, ...serviceMigrations])
  return db
}
