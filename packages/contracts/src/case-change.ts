import { z } from 'zod'
import { CarrierId, CaseId, LegId, UtcTimestamp, VehicleId } from './ids.js'
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
