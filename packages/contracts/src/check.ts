import { z } from 'zod'
import { CheckResultId, EvidenceRef, RuleId, UtcTimestamp } from './ids.js'
import { GateStatus, RuleScope } from './statuses.js'

export const CheckEngine = z.enum(['code', 'decisionTable', 'semantic', 'humanGate', 'combinator'])
export type CheckEngine = z.infer<typeof CheckEngine>

export const CheckSubject = z.object({
  scope: RuleScope,
  entityId: z.string().min(1),
})
export type CheckSubject = z.infer<typeof CheckSubject>

export const CheckResult = z.object({
  checkResultId: CheckResultId,
  ruleId: RuleId,
  ruleVersion: z.string().min(1),
  subject: CheckSubject,
  caseRevision: z.int().positive(),
  observedValue: z.unknown(),
  gateStatus: GateStatus,
  blockedBy: z.array(RuleId),
  dependsOnResultIds: z.array(CheckResultId),
  inputFingerprint: z.string().min(1),
  engine: CheckEngine,
  modelId: z.string().optional(),
  evidenceRefs: z.array(EvidenceRef),
  invalidatedByChange: z.string().optional(),
  affectedByChange: z.string().optional(),
  producedAt: UtcTimestamp,
})
export type CheckResult = z.infer<typeof CheckResult>
