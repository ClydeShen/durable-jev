import { z } from 'zod'

export const checkStatusSchema = z.enum([
  'PASS',
  'FAIL',
  'UNKNOWN',
  'NOT_APPLICABLE',
  'ERROR',
  'BLOCKED_DEPENDENCY',
  'WAITING_HUMAN',
  'INVALIDATED',
])
export type CheckStatus = z.infer<typeof checkStatusSchema>

export const pendingCheckStatuses = [
  'UNKNOWN',
  'BLOCKED_DEPENDENCY',
  'WAITING_HUMAN',
  'INVALIDATED',
] as const satisfies readonly CheckStatus[]
export type PendingCheckStatus = (typeof pendingCheckStatuses)[number]

export function isPendingCheckStatus(status: CheckStatus): status is PendingCheckStatus {
  return (pendingCheckStatuses as readonly CheckStatus[]).includes(status)
}

export const orderStatusSchema = z.enum([
  'SUBMITTED',
  'EVALUATING',
  'ON_HOLD',
  'AWAITING_HUMAN',
  'READY_TO_DISPATCH',
  'DISPATCHED',
  'REJECTED',
  'TECHNICAL_FAILURE',
])
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const recommendationSchema = z.enum([
  'READY_TO_DISPATCH',
  'NEED_INFORMATION',
  'NEED_HUMAN_ACTION',
  'REPLAN_REQUIRED',
  'REJECTED',
])
export type Recommendation = z.infer<typeof recommendationSchema>

export const roleSchema = z.enum([
  'transportPlanner',
  'complianceReviewer',
  'qualityReviewer',
  'commercialManager',
  'warehouseOperator',
  'dispatcher',
  'technicalEvaluator',
])
export type Role = z.infer<typeof roleSchema>

export const humanTaskTypeSchema = z.enum(['APPROVAL', 'OPERATION'])
export type HumanTaskType = z.infer<typeof humanTaskTypeSchema>

export const humanTaskStatusSchema = z.enum([
  'OPEN',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
])
export type HumanTaskStatus = z.infer<typeof humanTaskStatusSchema>

export const ruleEngineKindSchema = z.enum([
  'expression',
  'code',
  'decisionTable',
  'semantic',
  'humanGate',
  'combinator',
])
export type RuleEngineKind = z.infer<typeof ruleEngineKindSchema>
