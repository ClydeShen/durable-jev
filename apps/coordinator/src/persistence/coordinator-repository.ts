import type {
  CaseChange,
  CaseEvidence,
  CheckResult,
  HumanTask,
  HumanTaskStatus,
  Investigation,
  OrderStatus,
  ScriptedSemanticAnswer,
  Shipment,
} from '@durable-jev/contracts'
import { emptyCaseEvidence } from '@durable-jev/contracts'
import type { SemanticAnswer } from '@durable-jev/rule-evaluation'
import type { StoreDatabase } from '@durable-jev/store'

export type StoredCase = {
  caseId: string
  correlationId: string
  shipment: Shipment
  evidence: CaseEvidence
  orderStatus: OrderStatus
  createdAt: string
  updatedAt: string
}

type CaseRow = {
  case_id: string
  correlation_id: string
  shipment_json: string
  evidence_json: string
  order_status: OrderStatus
  created_at: string
  updated_at: string
}

const toStoredCase = (row: CaseRow): StoredCase => ({
  caseId: row.case_id,
  correlationId: row.correlation_id,
  shipment: JSON.parse(row.shipment_json),
  evidence: { ...emptyCaseEvidence, ...JSON.parse(row.evidence_json) },
  orderStatus: row.order_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class CoordinatorRepository {
  constructor(private readonly database: StoreDatabase) {}

  insertCase(stored: StoredCase): void {
    this.database
      .prepare(
        `INSERT INTO cases (case_id, correlation_id, shipment_json, evidence_json, case_revision, order_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.caseId,
        stored.correlationId,
        JSON.stringify(stored.shipment),
        JSON.stringify(stored.evidence),
        stored.shipment.caseRevision,
        stored.orderStatus,
        stored.createdAt,
        stored.updatedAt,
      )
  }

  findCase(caseId: string): StoredCase | undefined {
    const row = this.database.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseId) as
      | CaseRow
      | undefined
    return row && toStoredCase(row)
  }

  listCases(): StoredCase[] {
    const rows = this.database.prepare('SELECT * FROM cases ORDER BY created_at, case_id').all()
    return (rows as CaseRow[]).map(toStoredCase)
  }

  updateShipment(caseId: string, shipment: Shipment, updatedAt: string): void {
    this.database
      .prepare(
        'UPDATE cases SET shipment_json = ?, case_revision = ?, updated_at = ? WHERE case_id = ?',
      )
      .run(JSON.stringify(shipment), shipment.caseRevision, updatedAt, caseId)
  }

  insertChange(change: CaseChange): void {
    this.database
      .prepare(
        'INSERT INTO case_changes (change_id, case_id, to_revision, change_json) VALUES (?, ?, ?, ?)',
      )
      .run(change.changeId, change.caseId, change.toRevision, JSON.stringify(change))
  }

  // The trace a task or run was created in, so a later request in another trace can link to it.
  saveTraceLink(linkKey: string, traceparent: string): void {
    this.database
      .prepare('INSERT OR IGNORE INTO trace_links (link_key, traceparent) VALUES (?, ?)')
      .run(linkKey, traceparent)
  }

  findTraceLink(linkKey: string): string | undefined {
    const row = this.database
      .prepare('SELECT traceparent FROM trace_links WHERE link_key = ?')
      .get(linkKey) as { traceparent: string } | undefined
    return row?.traceparent
  }

  saveInvestigation(investigation: Investigation): void {
    this.database
      .prepare(
        `INSERT INTO investigations (investigation_id, case_id, status, investigation_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (investigation_id) DO UPDATE SET
           status = excluded.status, investigation_json = excluded.investigation_json`,
      )
      .run(
        investigation.investigationId,
        investigation.caseId,
        investigation.status,
        JSON.stringify(investigation),
      )
  }

  findInvestigation(investigationId: string): Investigation | undefined {
    const row = this.database
      .prepare('SELECT investigation_json FROM investigations WHERE investigation_id = ?')
      .get(investigationId) as { investigation_json: string } | undefined
    return row && JSON.parse(row.investigation_json)
  }

  listInvestigations(caseId: string): Investigation[] {
    const rows = this.database
      .prepare('SELECT investigation_json FROM investigations WHERE case_id = ? ORDER BY rowid')
      .all(caseId) as { investigation_json: string }[]
    return rows.map((row) => JSON.parse(row.investigation_json))
  }

  listChanges(caseId: string): CaseChange[] {
    const rows = this.database
      .prepare('SELECT change_json FROM case_changes WHERE case_id = ? ORDER BY to_revision')
      .all(caseId) as { change_json: string }[]
    return rows.map((row) => JSON.parse(row.change_json))
  }

  updateOrderStatus(caseId: string, orderStatus: OrderStatus, updatedAt: string): void {
    this.database
      .prepare('UPDATE cases SET order_status = ?, updated_at = ? WHERE case_id = ?')
      .run(orderStatus, updatedAt, caseId)
  }

  saveSemanticAnswer(
    caseId: string,
    ruleId: string,
    entityId: string,
    answer: SemanticAnswer,
  ): void {
    this.database
      .prepare(
        `INSERT INTO semantic_answers (case_id, rule_id, entity_id, answer_json) VALUES (?, ?, ?, ?)
         ON CONFLICT (case_id, rule_id, entity_id) DO UPDATE SET answer_json = excluded.answer_json`,
      )
      .run(caseId, ruleId, entityId, JSON.stringify(answer))
  }

  listSemanticAnswers(caseId: string): ScriptedSemanticAnswer[] {
    const rows = this.database
      .prepare('SELECT rule_id, entity_id, answer_json FROM semantic_answers WHERE case_id = ?')
      .all(caseId) as { rule_id: string; entity_id: string; answer_json: string }[]
    return rows.map((row) => ({
      ruleId: row.rule_id as never,
      entityId: row.entity_id,
      answer: JSON.parse(row.answer_json),
    }))
  }

  findSemanticAnswer(caseId: string, ruleId: string, entityId: string): SemanticAnswer | undefined {
    const row = this.database
      .prepare(
        'SELECT answer_json FROM semantic_answers WHERE case_id = ? AND rule_id = ? AND entity_id = ?',
      )
      .get(caseId, ruleId, entityId) as { answer_json: string } | undefined
    return row && JSON.parse(row.answer_json)
  }

  replaceCheckResults(caseId: string, results: readonly CheckResult[]): void {
    this.database.prepare('DELETE FROM check_results WHERE case_id = ?').run(caseId)
    const insert = this.database.prepare(
      `INSERT INTO check_results (case_id, rule_id, scope, entity_id, result_json) VALUES (?, ?, ?, ?, ?)`,
    )
    for (const result of results) {
      insert.run(
        caseId,
        result.ruleId,
        result.subject.scope,
        result.subject.entityId,
        JSON.stringify(result),
      )
    }
  }

  listCheckResults(caseId: string): CheckResult[] {
    const rows = this.database
      .prepare('SELECT result_json FROM check_results WHERE case_id = ? ORDER BY rowid')
      .all(caseId) as { result_json: string }[]
    return rows.map((row) => JSON.parse(row.result_json))
  }

  saveHumanTask(task: HumanTask, entityId: string): void {
    this.database
      .prepare(
        `INSERT INTO human_tasks (human_task_id, case_id, rule_id, entity_id, status, task_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (human_task_id) DO UPDATE SET status = excluded.status, task_json = excluded.task_json`,
      )
      .run(task.humanTaskId, task.caseId, task.ruleId, entityId, task.status, JSON.stringify(task))
  }

  findHumanTask(humanTaskId: string): HumanTask | undefined {
    const row = this.database
      .prepare('SELECT task_json FROM human_tasks WHERE human_task_id = ?')
      .get(humanTaskId) as { task_json: string } | undefined
    return row && JSON.parse(row.task_json)
  }

  findHumanTaskEntityId(humanTaskId: string): string | undefined {
    const row = this.database
      .prepare('SELECT entity_id FROM human_tasks WHERE human_task_id = ?')
      .get(humanTaskId) as { entity_id: string } | undefined
    return row?.entity_id
  }

  listHumanTasksForGate(caseId: string, ruleId: string, entityId: string): HumanTask[] {
    const rows = this.database
      .prepare(
        'SELECT task_json FROM human_tasks WHERE case_id = ? AND rule_id = ? AND entity_id = ? ORDER BY rowid',
      )
      .all(caseId, ruleId, entityId) as { task_json: string }[]
    return rows.map((row) => JSON.parse(row.task_json))
  }

  listHumanTasks(filter: { caseId?: string; status?: HumanTaskStatus } = {}): HumanTask[] {
    const rows = this.database
      .prepare(
        `SELECT task_json FROM human_tasks
         WHERE (@caseId IS NULL OR case_id = @caseId) AND (@status IS NULL OR status = @status)
         ORDER BY rowid`,
      )
      .all({ caseId: filter.caseId ?? null, status: filter.status ?? null }) as {
      task_json: string
    }[]
    return rows.map((row) => JSON.parse(row.task_json))
  }

  countHumanTasks(caseId: string): number {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM human_tasks WHERE case_id = ?')
      .get(caseId) as { count: number }
    return row.count
  }
}
