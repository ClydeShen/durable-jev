import type { BusinessCase, HumanTask } from '@durable-jev/contracts'
import { type RuleOutcome, scopeKey } from '@durable-jev/rule-engine'
import {
  appendToOutbox,
  type Db,
  type Migration,
  type OutboxEventDraft,
  openStore,
} from '@durable-jev/store'

const caseMigrations: readonly Migration[] = [
  // Historical SQL names stay stable so existing demo stores open without a data migration.
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

export interface CaseRecord<T extends BusinessCase = BusinessCase> {
  data: T
  completedAt?: string
  updatedAt: string
}

interface CaseRow {
  shipment_json: string
  dispatched_at: string | null
  updated_at: string
}

function toRecord<T extends BusinessCase>(
  row: CaseRow,
  parse: (input: unknown) => T,
): CaseRecord<T> {
  return {
    data: parse(JSON.parse(row.shipment_json)),
    ...(row.dispatched_at ? { completedAt: row.dispatched_at } : {}),
    updatedAt: row.updated_at,
  }
}

export class CaseStore<T extends BusinessCase = BusinessCase> {
  constructor(
    readonly db: Db,
    readonly parse: (input: unknown) => T,
  ) {}

  static open<Data extends BusinessCase>(
    path: string,
    parse: (input: unknown) => Data,
    agentMigrations: readonly Migration[] = [],
  ): CaseStore<Data> {
    return new CaseStore(openStore(path, [...caseMigrations, ...agentMigrations]), parse)
  }

  transaction<Result>(work: () => Result): Result {
    return this.db.transaction(work).immediate()
  }

  putCase(data: T, now: string): void {
    const validated = this.parse(data)
    this.db
      .prepare(
        `INSERT INTO cases (case_id, shipment_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (case_id) DO UPDATE SET shipment_json = excluded.shipment_json, updated_at = excluded.updated_at`,
      )
      .run(validated.caseId, JSON.stringify(validated), now)
  }

  caseRecord(caseId: string): CaseRecord<T> | undefined {
    const row = this.db
      .prepare<[string], CaseRow>(
        'SELECT shipment_json, dispatched_at, updated_at FROM cases WHERE case_id = ?',
      )
      .get(caseId)
    return row ? toRecord(row, this.parse) : undefined
  }

  cases(): CaseRecord<T>[] {
    return this.db
      .prepare<[], CaseRow>(
        'SELECT shipment_json, dispatched_at, updated_at FROM cases ORDER BY case_id',
      )
      .all()
      .map((row) => toRecord(row, this.parse))
  }

  markCompleted(caseId: string, now: string): void {
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

  replaceOutcomes(caseId: string, outcomes: readonly RuleOutcome[]): void {
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

  replaceForeignOutcomes(caseId: string, outcomes: readonly RuleOutcome[]): void {
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

  putTasks(tasks: readonly HumanTask[]): void {
    const upsert = this.db.prepare(
      `INSERT INTO human_tasks (human_task_id, case_id, status, task_json) VALUES (?, ?, ?, ?)
       ON CONFLICT (human_task_id) DO UPDATE SET status = excluded.status, task_json = excluded.task_json`,
    )
    for (const task of tasks)
      upsert.run(task.humanTaskId, task.caseId, task.status, JSON.stringify(task))
  }

  record(event: OutboxEventDraft): void {
    appendToOutbox(this.db, event)
  }
}
