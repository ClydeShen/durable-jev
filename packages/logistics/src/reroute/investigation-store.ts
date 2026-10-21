import type { ConversationId } from '@durable-jev/agent-harness'
import type { Role } from '@durable-jev/contracts'
import type { Db, Migration } from '@durable-jev/store'
import type { PlanCheck } from './reroute-plan.js'

export const investigationMigrations: readonly Migration[] = [
  {
    version: 101,
    name: 'reroute investigations',
    sql: `
      CREATE TABLE investigations (
        investigation_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        conversation_id INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL,
        body_json TEXT NOT NULL
      );
    `,
  },
]

export interface Incident {
  type: 'carrierCancelled'
  legId: string
}

export interface RerouteProposal {
  legId: string
  offerId: string
  carrierId: string
  vehicleId: string
  plannedDeparture: string
  plannedArrival: string
  extraCostCents: number
  rationale: string
  checks: PlanCheck[]
}

type InvestigationStatus = 'RUNNING' | 'PROPOSED' | 'ESCALATED' | 'CONFIRMED' | 'REJECTED' | 'STALE'

export interface Investigation {
  investigationId: string
  caseId: string
  caseRevision: number
  conversationId: ConversationId
  incident: Incident
  status: InvestigationStatus
  proposal?: RerouteProposal
  escalation?: string
  decidedBy?: { id: string; role: Role; at: string }
  startedAt: string
}

type Row = { body_json: string }

export class InvestigationStore {
  constructor(private readonly db: Db) {}

  put(investigation: Investigation) {
    this.db
      .prepare(
        `INSERT INTO investigations (investigation_id, case_id, conversation_id, status, body_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (investigation_id) DO UPDATE SET status = excluded.status, body_json = excluded.body_json`,
      )
      .run(
        investigation.investigationId,
        investigation.caseId,
        investigation.conversationId,
        investigation.status,
        JSON.stringify(investigation),
      )
  }

  get(investigationId: string): Investigation | undefined {
    const row = this.db
      .prepare<[string], Row>('SELECT body_json FROM investigations WHERE investigation_id = ?')
      .get(investigationId)
    return row && JSON.parse(row.body_json)
  }

  byConversation(conversationId: ConversationId): Investigation | undefined {
    const row = this.db
      .prepare<[number], Row>('SELECT body_json FROM investigations WHERE conversation_id = ?')
      .get(conversationId)
    return row && JSON.parse(row.body_json)
  }

  ofCase(caseId: string): Investigation[] {
    return this.db
      .prepare<[string], Row>(
        'SELECT body_json FROM investigations WHERE case_id = ? ORDER BY investigation_id',
      )
      .all(caseId)
      .map((row) => JSON.parse(row.body_json))
  }

  running(): Investigation[] {
    return this.db
      .prepare<[], Row>("SELECT body_json FROM investigations WHERE status = 'RUNNING'")
      .all()
      .map((row) => JSON.parse(row.body_json))
  }
}
