import { reservationMachine, type Shipment } from '@durable-jev/contracts'
import { executeOnce, type Migration, type StoreDatabase } from '@durable-jev/store'

export const reservationMigrations: readonly Migration[] = [
  {
    id: 'transport-001-reservations',
    sql: `CREATE TABLE reservations (
      reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      route_version INTEGER NOT NULL,
      leg_id TEXT NOT NULL,
      carrier_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE (case_id, route_version, leg_id)
    )`,
  },
]

export function reservationOperationId(shipment: Shipment): string {
  return `${shipment.caseId}:route-v${shipment.entityVersions.route}:reserve_transport`
}

export function ensurePlanReservation(database: StoreDatabase, shipment: Shipment): boolean {
  const routeVersion = shipment.entityVersions.route
  const insert = database.prepare(
    `INSERT INTO reservations (case_id, route_version, leg_id, carrier_id, vehicle_id, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  executeOnce(
    database,
    {
      operationId: reservationOperationId(shipment),
      actionType: 'reserve_transport',
      request: { legs: shipment.legs.map((leg) => leg.legId) },
    },
    () =>
      shipment.legs.map((leg) =>
        Number(
          insert.run(
            shipment.caseId,
            routeVersion,
            leg.legId,
            leg.carrierId,
            leg.vehicleId,
            reservationMachine.initial,
          ).lastInsertRowid,
        ),
      ),
  )
  return countActiveReservations(database, shipment.caseId, routeVersion) === shipment.legs.length
}

export function countActiveReservations(
  database: StoreDatabase,
  caseId: string,
  routeVersion: number,
): number {
  const row = database
    .prepare(
      'SELECT COUNT(*) AS count FROM reservations WHERE case_id = ? AND route_version = ? AND status = ?',
    )
    .get(caseId, routeVersion, reservationMachine.initial) as { count: number }
  return row.count
}
