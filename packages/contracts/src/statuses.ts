import { z } from 'zod'

export const GateStatus = z.enum([
  'PASS',
  'FAIL',
  'UNKNOWN',
  'NOT_APPLICABLE',
  'ERROR',
  'BLOCKED_DEPENDENCY',
  'WAITING_HUMAN',
  'INVALIDATED',
])
export type GateStatus = z.infer<typeof GateStatus>

export const pendingGateStatuses = [
  'UNKNOWN',
  'BLOCKED_DEPENDENCY',
  'WAITING_HUMAN',
  'INVALIDATED',
] as const satisfies readonly GateStatus[]
export type PendingGateStatus = (typeof pendingGateStatuses)[number]

export function isPendingGateStatus(status: GateStatus): status is PendingGateStatus {
  return (pendingGateStatuses as readonly GateStatus[]).includes(status)
}

export const OrderStatus = z.enum([
  'SUBMITTED',
  'EVALUATING',
  'ON_HOLD',
  'AWAITING_HUMAN',
  'READY_TO_DISPATCH',
  'DISPATCHED',
  'REJECTED',
  'TECHNICAL_FAILURE',
])
export type OrderStatus = z.infer<typeof OrderStatus>

export const Recommendation = z.enum([
  'READY_TO_DISPATCH',
  'NEED_INFORMATION',
  'NEED_HUMAN_ACTION',
  'REPLAN_REQUIRED',
  'REJECTED',
])
export type Recommendation = z.infer<typeof Recommendation>

export const Role = z.enum([
  'TRANSPORT_PLANNER',
  'COMPLIANCE_REVIEWER',
  'QUALITY_REVIEWER',
  'COMMERCIAL_MANAGER',
  'WAREHOUSE_OPERATOR',
  'DISPATCHER',
  'TECHNICAL_EVALUATOR',
])
export type Role = z.infer<typeof Role>

export const RuleScope = z.enum(['order', 'cargoItem', 'leg'])
export type RuleScope = z.infer<typeof RuleScope>
