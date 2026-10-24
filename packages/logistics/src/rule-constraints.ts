import { cargoCategorySchema } from '@durable-jev/contracts'
import type { RuleConstraints } from '@durable-jev/rule-engine'
import { z } from 'zod'
import { agentProfiles } from './agent-profiles.js'

export const logisticsAgentIdSchema = z.enum(
  Object.keys(agentProfiles) as [keyof typeof agentProfiles, ...(keyof typeof agentProfiles)[]],
)
export const logisticsRoleSchema = z.enum([
  'transportPlanner',
  'complianceReviewer',
  'qualityReviewer',
  'commercialManager',
  'warehouseOperator',
  'dispatcher',
  'technicalEvaluator',
])

export const logisticsRuleConstraints: RuleConstraints = {
  rootScope: 'order',
  scopes: ['order', 'cargoItem', 'leg'],
  agents: logisticsAgentIdSchema.options,
  roles: logisticsRoleSchema.options,
  invalidationTriggers: ['cargo', 'route', 'carrier', 'quote', 'documents'],
  classification: { scope: 'cargoItem', dimension: 'commodityGroups' },
  applicabilityDimensions: ['destinations', 'commodityGroups', 'customers'],
  mixingCategories: cargoCategorySchema.options,
  requiresApplicability: (ruleId) => !/^R\d{2}$/.test(ruleId),
}
