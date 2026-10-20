import {
  CaseEvidence,
  GateStatus,
  OrderStatus,
  PlanChange,
  Role,
  RuleId,
  ScriptedSemanticAnswer,
  Shipment,
} from '@durable-jev/contracts'
import { z } from 'zod'

const StageExpectation = z.object({
  orderStatus: OrderStatus.optional(),
  gates: z.record(z.string(), GateStatus).optional(),
  openHumanTasks: z.array(z.object({ ruleId: RuleId, requiredRole: Role })).optional(),
  invalidated: z.array(RuleId).optional(),
  notInvalidated: z.array(RuleId).optional(),
  error: z.string().optional(),
})
export type StageExpectation = z.infer<typeof StageExpectation>

const taskTarget = { ruleId: RuleId, entityId: z.string().optional(), actor: Role }

export const EventScriptStep = z.discriminatedUnion('step', [
  z.object({ step: z.literal('submit'), expect: StageExpectation }),
  z.object({
    step: z.literal('completeHumanTask'),
    ...taskTarget,
    fields: z.record(z.string(), z.string()),
    expect: StageExpectation,
  }),
  z.object({
    step: z.literal('approveHumanTask'),
    ...taskTarget,
    conditions: z.array(z.enum(['REWORK_REQUIRED'])).optional(),
    expect: StageExpectation,
  }),
  z.object({
    step: z.literal('rejectHumanTask'),
    ...taskTarget,
    reason: z.string().min(1),
    expect: StageExpectation,
  }),
  z.object({
    step: z.literal('changePlan'),
    actor: Role,
    change: PlanChange,
    expect: StageExpectation,
  }),
  z.object({ step: z.literal('restartCoordinator'), expect: StageExpectation }),
  z.object({ step: z.literal('dispatch'), actor: Role, expect: StageExpectation }),
])
export type EventScriptStep = z.infer<typeof EventScriptStep>

export const CaseFile = z.object({
  caseId: z.string().min(1),
  title: z.string().min(1),
  reviewStatus: z.enum(['draft', 'reviewed']),
  shipment: Shipment,
  evidence: CaseEvidence.default({ documents: [], temperatureLogs: [], inspectionNotes: [] }),
  scriptedSemanticAnswers: z.array(ScriptedSemanticAnswer),
  eventScript: z.array(EventScriptStep).min(1),
})
export type CaseFile = z.infer<typeof CaseFile>
