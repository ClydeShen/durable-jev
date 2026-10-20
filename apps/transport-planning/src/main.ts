import { startBranchService } from '@durable-jev/branch-service'
import { ensurePlanReservation, reservationMigrations } from '@durable-jev/transport-reservations'

await startBranchService({
  serviceName: 'transport-planning',
  branches: ['plan'],
  defaultPort: 4120,
  extraMigrations: reservationMigrations,
  ensurePlanReservation: (database, request) => ensurePlanReservation(database, request.shipment),
})
