import { z } from 'zod'
import { CaseEvidence } from './evidence.schema.js'
import { HumanDecision } from './human-task.schema.js'
import { CaseId, RuleId } from './ids.schema.js'
import { ScriptedSemanticAnswer } from './semantic-answer.schema.js'
import { Shipment } from './shipment.schema.js'
import { GateStatus, RuleScope } from './statuses.schema.js'

export const RuleBranch = z.enum([
  'base',
  'controlled',
  'coldChain',
  'plan',
  'commercial',
  'release',
])
export type RuleBranch = z.infer<typeof RuleBranch>

export const RuleEvaluationRecord = z.object({
  ruleId: RuleId,
  subject: z.object({ scope: RuleScope, entityId: z.string().min(1) }),
  gateStatus: GateStatus,
  observedValue: z.unknown().optional(),
  blockedBy: z.array(RuleId),
})
export type RuleEvaluationRecord = z.infer<typeof RuleEvaluationRecord>

export const HumanGateState = z.object({
  ruleId: RuleId,
  entityId: z.string().min(1),
  status: GateStatus,
  decision: HumanDecision.optional(),
  completedFields: z.record(z.string(), z.string()).optional(),
})
export type HumanGateState = z.infer<typeof HumanGateState>

export const BranchEvaluationRequest = z.object({
  caseId: CaseId,
  caseRevision: z.int().positive(),
  shipment: Shipment,
  evidence: CaseEvidence,
  semanticAnswers: z.array(ScriptedSemanticAnswer),
  upstreamResults: z.array(RuleEvaluationRecord),
  humanGates: z.array(HumanGateState),
})
export type BranchEvaluationRequest = z.infer<typeof BranchEvaluationRequest>

export const HumanGateRequest = z.object({ ruleId: RuleId, entityId: z.string().min(1) })
export type HumanGateRequest = z.infer<typeof HumanGateRequest>

export const BranchEvaluationResult = z.object({
  evaluations: z.array(RuleEvaluationRecord),
  humanGateRequests: z.array(HumanGateRequest),
})
export type BranchEvaluationResult = z.infer<typeof BranchEvaluationResult>
