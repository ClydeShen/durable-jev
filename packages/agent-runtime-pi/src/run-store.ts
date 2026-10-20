import type { RunBudgetState, RunOutcome } from '@durable-jev/agent-harness'
import type { Migration, StoreDatabase } from '@durable-jev/store'

// Kept outside Pi's storage: the restart count and the run's result must be readable even
// when the Pi run itself cannot continue.
export const piRuntimeMigrations: readonly Migration[] = [
  {
    id: 'pi-runtime-001-agent-runs',
    sql: `CREATE TABLE agent_runs (
      run_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      input_json TEXT NOT NULL,
      budget_json TEXT NOT NULL,
      outcome_json TEXT
    )`,
  },
]

export type StoredRun = {
  runId: string
  requestId: string
  input: unknown
  budget: RunBudgetState
  outcome?: RunOutcome
}

type RunRow = {
  run_id: string
  request_id: string
  input_json: string
  budget_json: string
  outcome_json: string | null
}

const toStoredRun = (row: RunRow): StoredRun => ({
  runId: row.run_id,
  requestId: row.request_id,
  input: JSON.parse(row.input_json),
  budget: JSON.parse(row.budget_json),
  ...(row.outcome_json ? { outcome: JSON.parse(row.outcome_json) } : {}),
})

export class RunStore {
  constructor(private readonly database: StoreDatabase) {}

  insert(run: StoredRun): void {
    this.database
      .prepare(
        'INSERT INTO agent_runs (run_id, request_id, input_json, budget_json) VALUES (?, ?, ?, ?)',
      )
      .run(run.runId, run.requestId, JSON.stringify(run.input), JSON.stringify(run.budget))
  }

  find(runId: string): StoredRun | undefined {
    const row = this.database.prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(runId) as
      | RunRow
      | undefined
    return row && toStoredRun(row)
  }

  unfinished(runIdPrefix: string): StoredRun[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM agent_runs WHERE outcome_json IS NULL AND run_id LIKE ? ORDER BY rowid',
      )
      .all(`${runIdPrefix}%`) as RunRow[]
    return rows.map(toStoredRun)
  }

  saveBudget(runId: string, budget: RunBudgetState): void {
    this.database
      .prepare('UPDATE agent_runs SET budget_json = ? WHERE run_id = ?')
      .run(JSON.stringify(budget), runId)
  }

  // The first outcome wins: a result tool replayed after a crash cannot overwrite it.
  finish(runId: string, outcome: RunOutcome): RunOutcome {
    this.database
      .prepare('UPDATE agent_runs SET outcome_json = ? WHERE run_id = ? AND outcome_json IS NULL')
      .run(JSON.stringify(outcome), runId)
    return this.find(runId)?.outcome ?? outcome
  }
}
