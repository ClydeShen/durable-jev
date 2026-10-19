import { z } from 'zod'
import { CaseId, EvidenceRef, HumanTaskId, RuleId, UtcTimestamp } from './ids.js'
import { EntityVersions } from './shipment.js'
import { Role } from './statuses.js'

export const HumanTaskType = z.enum(['APPROVAL', 'OPERATION'])
export type HumanTaskType = z.infer<typeof HumanTaskType>

export const HumanTaskStatus = z.enum([
  'OPEN',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
])
export type HumanTaskStatus = z.infer<typeof HumanTaskStatus>

export const HumanTaskTarget = z.object({
  caseRevision: z.int().positive(),
  entityVersions: EntityVersions,
  inputFingerprint: z.string().min(1),
})
export type HumanTaskTarget = z.infer<typeof HumanTaskTarget>

export const HumanDecision = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED']),
  decidedBy: Role,
  decidedAt: UtcTimestamp,
  reason: z.string().optional(),
})
export type HumanDecision = z.infer<typeof HumanDecision>

export const ActionEvidence = z.object({
  completedBy: Role,
  completedAt: UtcTimestamp,
  fields: z.record(z.string(), z.string()),
  evidenceRefs: z.array(EvidenceRef),
})
export type ActionEvidence = z.infer<typeof ActionEvidence>

export const HumanTask = z.object({
  humanTaskId: HumanTaskId,
  caseId: CaseId,
  ruleId: RuleId,
  taskType: HumanTaskType,
  requiredRole: Role,
  target: HumanTaskTarget,
  prerequisites: z.array(RuleId),
  requiredEvidenceFields: z.array(z.string()),
  status: HumanTaskStatus,
  decision: HumanDecision.optional(),
  actionEvidence: ActionEvidence.optional(),
  createdAt: UtcTimestamp,
  expiresAt: UtcTimestamp,
  supersededBy: HumanTaskId.optional(),
})
export type HumanTask = z.infer<typeof HumanTask>
