import type { Migration } from '@durable-jev/store'

export const coordinatorMigrations: readonly Migration[] = [
  {
    id: 'coordinator-001-cases',
    sql: `CREATE TABLE cases (
      case_id TEXT PRIMARY KEY,
      correlation_id TEXT NOT NULL,
      shipment_json TEXT NOT NULL,
      case_revision INTEGER NOT NULL,
      order_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  },
  {
    id: 'coordinator-002-semantic-answers',
    sql: `CREATE TABLE semantic_answers (
      case_id TEXT NOT NULL REFERENCES cases (case_id),
      rule_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      answer_json TEXT NOT NULL,
      PRIMARY KEY (case_id, rule_id, entity_id)
    )`,
  },
  {
    id: 'coordinator-003-check-results',
    sql: `CREATE TABLE check_results (
      case_id TEXT NOT NULL REFERENCES cases (case_id),
      rule_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      PRIMARY KEY (case_id, rule_id, scope, entity_id)
    )`,
  },
  {
    id: 'coordinator-004-human-tasks',
    sql: `CREATE TABLE human_tasks (
      human_task_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases (case_id),
      rule_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL,
      task_json TEXT NOT NULL
    );
    CREATE INDEX human_tasks_by_case_rule ON human_tasks (case_id, rule_id, entity_id)`,
  },
  {
    id: 'coordinator-005-reservations',
    sql: `CREATE TABLE reservations (
      reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES cases (case_id),
      route_version INTEGER NOT NULL,
      leg_id TEXT NOT NULL,
      carrier_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE (case_id, route_version, leg_id)
    )`,
  },
  {
    id: 'coordinator-006-case-evidence',
    sql: `ALTER TABLE cases ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}'`,
  },
]
