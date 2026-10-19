import { GateStatus, OrderStatus, Role, RuleId, Shipment } from '@durable-jev/contracts'
import { z } from 'zod'

export const ScriptedSemanticAnswer = z.object({
  ruleId: RuleId,
  entityId: z.string().min(1),
  answer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) }),
    z.object({
      type: z.literal('choice'),
      choice: z.string().min(1),
      probabilities: z.record(z.string(), z.number()),
    }),
  ]),
})
export type ScriptedSemanticAnswer = z.infer<typeof ScriptedSemanticAnswer>

const StageExpectation = z.object({
  orderStatus: OrderStatus,
  gates: z.record(z.string(), GateStatus),
  openHumanTasks: z.array(z.object({ ruleId: RuleId, requiredRole: Role })).optional(),
})

export const EventScriptStep = z.discriminatedUnion('step', [
  z.object({ step: z.literal('submit'), expect: StageExpectation }),
  z.object({
    step: z.literal('completeHumanTask'),
    ruleId: RuleId,
    actor: Role,
    fields: z.record(z.string(), z.string()),
    expect: StageExpectation,
  }),
  z.object({
    step: z.literal('approveHumanTask'),
    ruleId: RuleId,
    actor: Role,
    expect: StageExpectation,
  }),
  z.object({ step: z.literal('dispatch'), actor: Role, expect: StageExpectation }),
])
export type EventScriptStep = z.infer<typeof EventScriptStep>

export const CaseFile = z.object({
  caseId: z.string().min(1),
  title: z.string().min(1),
  reviewStatus: z.enum(['draft', 'reviewed']),
  shipment: Shipment,
  scriptedSemanticAnswers: z.array(ScriptedSemanticAnswer),
  eventScript: z.array(EventScriptStep).min(1),
})
export type CaseFile = z.infer<typeof CaseFile>
