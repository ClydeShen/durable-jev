import { cargoCategorySchema } from '@durable-jev/contracts'
import type { RuleConstraints } from '@durable-jev/rule-engine'

export const logisticsRuleConstraints: RuleConstraints = {
  applicabilityDimensions: ['destinations', 'commodityGroups', 'customers'],
  mixingCategories: cargoCategorySchema.options,
  requiresApplicability: (ruleId) => !/^R\d{2}$/.test(ruleId),
}
