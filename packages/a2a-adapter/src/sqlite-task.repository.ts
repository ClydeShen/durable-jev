import type { Task } from '@a2a-js/sdk'
import type { TaskStore } from '@a2a-js/sdk/server'
import type { Migration, StoreDatabase } from '@durable-jev/store'

// The SDK's InMemoryTaskStore forgets every task on restart; services keep theirs in SQLite.
export const a2aServerMigrations: readonly Migration[] = [
  {
    id: 'a2a-server-001-tasks',
    sql: `CREATE TABLE a2a_server_tasks (
      task_id TEXT PRIMARY KEY,
      task_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE a2a_server_messages (
      message_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL
    )`,
  },
]

export class SqliteTaskStore implements TaskStore {
  constructor(private readonly database: StoreDatabase) {}

  async save(task: Task): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO a2a_server_tasks (task_id, task_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (task_id) DO UPDATE SET task_json = excluded.task_json, updated_at = excluded.updated_at`,
      )
      .run(task.id, JSON.stringify(task), new Date().toISOString())
  }

  async load(taskId: string): Promise<Task | undefined> {
    const row = this.database
      .prepare('SELECT task_json FROM a2a_server_tasks WHERE task_id = ?')
      .get(taskId) as { task_json: string } | undefined
    return row && JSON.parse(row.task_json)
  }

  async list(): Promise<never> {
    throw new Error('listing tasks is not supported')
  }

  taskIdForMessage(messageId: string): string | undefined {
    const row = this.database
      .prepare('SELECT task_id FROM a2a_server_messages WHERE message_id = ?')
      .get(messageId) as { task_id: string } | undefined
    return row?.task_id
  }

  recordMessage(messageId: string, taskId: string): void {
    this.database
      .prepare('INSERT OR IGNORE INTO a2a_server_messages (message_id, task_id) VALUES (?, ?)')
      .run(messageId, taskId)
  }
}
