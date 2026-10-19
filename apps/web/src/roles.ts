import type { Role } from '@durable-jev/contracts'

export const roleLabels: Record<Role, string> = {
  TRANSPORT_PLANNER: '运输计划员',
  COMPLIANCE_REVIEWER: '合规审核员',
  QUALITY_REVIEWER: '质量审核员',
  COMMERCIAL_MANAGER: '商务主管',
  WAREHOUSE_OPERATOR: '仓库操作员',
  DISPATCHER: '调度员',
  TECHNICAL_EVALUATOR: '技术评估者',
}

export const roles = Object.keys(roleLabels) as Role[]
