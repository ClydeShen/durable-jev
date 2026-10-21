import { z } from 'zod'

const checkStatusSchema = z.enum([
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

const pendingCheckStatuses = [
  'UNKNOWN',
  'BLOCKED_DEPENDENCY',
  'WAITING_HUMAN',
  'INVALIDATED',
] as const satisfies readonly CheckStatus[]
export type PendingCheckStatus = (typeof pendingCheckStatuses)[number]

export function isPendingCheckStatus(status: CheckStatus): status is PendingCheckStatus {
  return (pendingCheckStatuses as readonly CheckStatus[]).includes(status)
}

const orderStatusSchema = z.enum([
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

export const humanTaskStatusSchema = z.enum([
  'OPEN',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
])

export const ruleEngineKindSchema = z.enum([
  'expression',
  'code',
  'decisionTable',
  'semantic',
  'humanGate',
  'combinator',
])
export type RuleEngineKind = z.infer<typeof ruleEngineKindSchema>
