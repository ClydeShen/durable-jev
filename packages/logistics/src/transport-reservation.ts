import type { LeafEvaluator } from '@durable-jev/rule-engine'
import type { Migration } from '@durable-jev/store'
import { type Db, runOnce } from '@durable-jev/store'

export const reservationMigrations: readonly Migration[] = [
  {
    version: 100,
    name: 'transport reservations',
    sql: `
      CREATE TABLE reservations (
        reservation_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        leg_id TEXT NOT NULL,
        route_version INTEGER NOT NULL,
        carrier_id TEXT NOT NULL
      );
    `,
  },
]

export function reserveTransport(db: Db): LeafEvaluator {
  return ({ facts, scopeFacts }) => {
    const caseId = String(facts.root.facts.caseId)
    const legId = String(scopeFacts.legId)
    const routeVersion = Number(facts.entityVersions.route)
    const carrierId = String(scopeFacts.carrierId)
    const reservationId = `RES-${caseId}-${legId}-v${routeVersion}`
    const { result } = runOnce(
      db,
      {
        operationId: `${caseId}:route-v${routeVersion}:reserve_transport:${legId}`,
        kind: 'reserve_transport',
        request: { legId, routeVersion, carrierId },
      },
      () => {
        db.prepare(
          'INSERT INTO reservations (reservation_id, case_id, leg_id, route_version, carrier_id) VALUES (?, ?, ?, ?, ?)',
        ).run(reservationId, caseId, legId, routeVersion, carrierId)
        return { reservationId }
      },
    )
    return { status: 'PASS', observedValue: result.reservationId }
  }
}
