import { z } from 'zod'
import { CargoItemId, CarrierId, CaseId, LegId, UtcTimestamp, VehicleId } from './ids.js'
import { TransportLeg } from './shipment.js'
import { Role } from './statuses.js'

export const PlanChange = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reassignVehicle'), legId: LegId, vehicleId: VehicleId }),
  z.object({
    kind: z.literal('changeCarrier'),
    legId: LegId,
    carrierId: CarrierId,
    vehicleId: VehicleId,
  }),
  z.object({ kind: z.literal('changeQuote'), amountCents: z.int().nonnegative() }),
  z.object({ kind: z.literal('replaceLegs'), legs: z.array(TransportLeg).min(1).max(3) }),
  z.object({
    kind: z.literal('recordPackaging'),
    cargoItemId: CargoItemId,
    packagingId: z.string().min(1),
  }),
])
export type PlanChange = z.infer<typeof PlanChange>

export const CaseChange = z.object({
  changeId: z.string().min(1),
  caseId: CaseId,
  fromRevision: z.int().positive(),
  toRevision: z.int().positive(),
  change: PlanChange,
  triggers: z.array(z.string()),
  invalidatedRuleIds: z.array(z.string()),
  requestedBy: Role,
  requestedAt: UtcTimestamp,
})
export type CaseChange = z.infer<typeof CaseChange>
