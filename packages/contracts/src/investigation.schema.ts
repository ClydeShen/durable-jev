import { z } from 'zod'
import { CarrierId, CaseId, LegId, UtcTimestamp, VehicleId } from './ids.js'
import { Role } from './statuses.js'

export const InvestigationStatus = z.enum([
  'RUNNING',
  'PROPOSED',
  'NO_CANDIDATE',
  'ESCALATED',
  'ACCEPTED',
  'REJECTED',
  'STALE',
])
export type InvestigationStatus = z.infer<typeof InvestigationStatus>

// An agent's proposal has no effect until the transport planner accepts it; accepting applies
// it as an ordinary plan change, so every rule it touches is re-checked.
export const Investigation = z.object({
  investigationId: z.string().min(1),
  caseId: CaseId,
  caseRevision: z.int().positive(),
  legId: LegId,
  unavailableCarrierIds: z.array(CarrierId),
  reason: z.string(),
  status: InvestigationStatus,
  proposal: z.object({ carrierId: CarrierId, vehicleId: VehicleId }).optional(),
  summary: z.string(),
  runId: z.string().min(1),
  modelId: z.string().min(1),
  toolCalls: z.int().nonnegative(),
  requestedBy: Role,
  requestedAt: UtcTimestamp,
  decidedAt: UtcTimestamp.optional(),
  decisionReason: z.string().optional(),
})
export type Investigation = z.infer<typeof Investigation>
