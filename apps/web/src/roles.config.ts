import type { Role } from '@durable-jev/contracts'

export const roleLabels: Record<Role, string> = {
  TRANSPORT_PLANNER: 'Transport planner',
  COMPLIANCE_REVIEWER: 'Compliance reviewer',
  QUALITY_REVIEWER: 'Quality reviewer',
  COMMERCIAL_MANAGER: 'Commercial manager',
  WAREHOUSE_OPERATOR: 'Warehouse operator',
  DISPATCHER: 'Dispatcher',
  TECHNICAL_EVALUATOR: 'Technical evaluator',
}

export const roles = Object.keys(roleLabels) as Role[]
