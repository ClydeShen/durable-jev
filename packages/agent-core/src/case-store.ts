import type { HumanTask, Shipment } from '@durable-jev/contracts'
import { type RuleOutcome, scopeKey } from '@durable-jev/rule-engine'
import {
  appendToOutbox,
  type Db,
  type Migration,
  type OutboxEventDraft,
  openStore,
} from '@durable-jev/store'

const caseMigrations: readonly Migration[] = [
  {
    version: 10,
    name: 'cases, rule results and human tasks',
    sql: `
      CREATE TABLE cases (
        case_id TEXT PRIMARY KEY,
        shipment_json TEXT NOT NULL,
        dispatched_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE rule_results (
        case_id TEXT NOT NULL REFERENCES cases (case_id),
        rule_id TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        PRIMARY KEY (case_id, rule_id, scope_key)
      );
      CREATE TABLE human_tasks (
        human_task_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases (case_id),
        status TEXT NOT NULL,
        task_json TEXT NOT NULL
      );
      CREATE INDEX human_tasks_open ON human_tasks (status);
    `,
  },
  {
    version: 11,
    name: 'results reported by other agents',
    sql: `
      CREATE TABLE foreign_results (
        case_id TEXT PRIMARY KEY REFERENCES cases (case_id),
        outcomes_json TEXT NOT NULL
      );
    `,
  },
]

export interface CaseRecord {
  shipment: Shipment
  dispatchedAt?: string
  updatedAt: string
}

interface CaseRow {
  shipment_json: string
  dispatched_at: string | null
  updated_at: string
}

const toRecord = (row: CaseRow): CaseRecord => ({
  shipment: JSON.parse(row.shipment_json),
  ...(row.dispatched_at ? { dispatchedAt: row.dispatched_at } : {}),
  updatedAt: row.updated_at,
})

export class CaseStore {
  constructor(readonly db: Db) {}

  static open(path: string, agentMigrations: readonly Migration[] = []): CaseStore {
    return new CaseStore(openStore(path, [...caseMigrations, ...agentMigrations]))
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work).immediate()
  }

  putCase(shipment: Shipment, now: string) {
    this.db
      .prepare(
        `INSERT INTO cases (case_id, shipment_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (case_id) DO UPDATE SET shipment_json = excluded.shipment_json, updated_at = excluded.updated_at`,
      )
      .run(shipment.caseId, JSON.stringify(shipment), now)
  }

  caseRecord(caseId: string): CaseRecord | undefined {
    const row = this.db
      .prepare<[string], CaseRow>(
        'SELECT shipment_json, dispatched_at, updated_at FROM cases WHERE case_id = ?',
      )
      .get(caseId)
    return row ? toRecord(row) : undefined
  }

  cases(): CaseRecord[] {
    return this.db
      .prepare<[], CaseRow>(
        'SELECT shipment_json, dispatched_at, updated_at FROM cases ORDER BY case_id',
      )
      .all()
      .map(toRecord)
  }

  markDispatched(caseId: string, now: string) {
    this.db
      .prepare('UPDATE cases SET dispatched_at = ?, updated_at = ? WHERE case_id = ?')
      .run(now, now, caseId)
  }

  outcomes(caseId: string): RuleOutcome[] {
    return this.db
      .prepare<[string], { outcome_json: string }>(
        'SELECT outcome_json FROM rule_results WHERE case_id = ?',
      )
      .all(caseId)
      .map((row) => JSON.parse(row.outcome_json))
  }

  replaceOutcomes(caseId: string, outcomes: readonly RuleOutcome[]) {
    this.db.prepare('DELETE FROM rule_results WHERE case_id = ?').run(caseId)
    const insert = this.db.prepare(
      'INSERT INTO rule_results (case_id, rule_id, scope_key, outcome_json) VALUES (?, ?, ?, ?)',
    )
    for (const outcome of outcomes) {
      insert.run(caseId, outcome.ruleId, scopeKey(outcome.scope), JSON.stringify(outcome))
    }
  }

  foreignOutcomes(caseId: string): RuleOutcome[] {
    const row = this.db
      .prepare<[string], { outcomes_json: string }>(
        'SELECT outcomes_json FROM foreign_results WHERE case_id = ?',
      )
      .get(caseId)
    return row ? JSON.parse(row.outcomes_json) : []
  }

  replaceForeignOutcomes(caseId: string, outcomes: readonly RuleOutcome[]) {
    this.db
      .prepare(
        `INSERT INTO foreign_results (case_id, outcomes_json) VALUES (?, ?)
         ON CONFLICT (case_id) DO UPDATE SET outcomes_json = excluded.outcomes_json`,
      )
      .run(caseId, JSON.stringify(outcomes))
  }

  tasksOf(caseId: string): HumanTask[] {
    return this.db
      .prepare<[string], { task_json: string }>(
        'SELECT task_json FROM human_tasks WHERE case_id = ? ORDER BY human_task_id',
      )
      .all(caseId)
      .map((row) => JSON.parse(row.task_json))
  }

  task(humanTaskId: string): HumanTask | undefined {
    const row = this.db
      .prepare<[string], { task_json: string }>(
        'SELECT task_json FROM human_tasks WHERE human_task_id = ?',
      )
      .get(humanTaskId)
    return row ? JSON.parse(row.task_json) : undefined
  }

  openTasks(): HumanTask[] {
    return this.db
      .prepare<[], { task_json: string }>(
        "SELECT task_json FROM human_tasks WHERE status = 'OPEN' ORDER BY human_task_id",
      )
      .all()
      .map((row) => JSON.parse(row.task_json))
  }

  putTasks(tasks: readonly HumanTask[]) {
    const upsert = this.db.prepare(
      `INSERT INTO human_tasks (human_task_id, case_id, status, task_json) VALUES (?, ?, ?, ?)
       ON CONFLICT (human_task_id) DO UPDATE SET status = excluded.status, task_json = excluded.task_json`,
    )
    for (const task of tasks)
      upsert.run(task.humanTaskId, task.caseId, task.status, JSON.stringify(task))
  }

  record(event: OutboxEventDraft) {
    appendToOutbox(this.db, event)
  }
}
