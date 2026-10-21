import type { GateStatus, HumanTask, OrderStatus, RuleId } from '@durable-jev/contracts'
import { type RuleDefinition, type RuleEvaluation, upstreamRuleIds } from '@durable-jev/rule-engine'

export const finalGateRuleId = 'R40' as RuleId
export const dispatchConfirmationRuleId = 'R39-CONFIRM' as RuleId
const loadedAndConfirmedRuleId = 'R39'

export const gatesBeforeDispatchConfirmation = (rules: readonly RuleDefinition[]): string[] => {
  const rulesById = new Map(rules.map((rule) => [rule.ruleId as string, rule]))
  const upstreamOf = (ruleId: string) => {
    const rule = rulesById.get(ruleId)
    return rule ? upstreamRuleIds(rule) : []
  }
  return [
    ...new Set([...upstreamOf(finalGateRuleId), ...upstreamOf(loadedAndConfirmedRuleId)]),
  ].filter((ruleId) => ruleId !== loadedAndConfirmedRuleId && ruleId !== dispatchConfirmationRuleId)
}

const isSettledPositively = (status: GateStatus) => status === 'PASS' || status === 'NOT_APPLICABLE'

export const deriveOrderStatus = (input: {
  evaluations: readonly RuleEvaluation[]
  finalGateStatus: GateStatus
  openHumanTasks: readonly HumanTask[]
  gatesBeforeConfirmation: readonly string[]
}): OrderStatus => {
  const { evaluations, finalGateStatus, openHumanTasks } = input
  if (finalGateStatus === 'PASS') return 'READY_TO_DISPATCH'
  if (finalGateStatus === 'ERROR') return 'TECHNICAL_FAILURE'
  if (finalGateStatus === 'FAIL') return 'ON_HOLD'

  const releaseGates = new Set(input.gatesBeforeConfirmation)
  const onlyDispatchConfirmationOutstanding = evaluations
    .filter((evaluation) => releaseGates.has(evaluation.ruleId))
    .every((evaluation) => isSettledPositively(evaluation.gateStatus))
  const awaitingDispatcher = openHumanTasks.some(
    (task) => task.ruleId === dispatchConfirmationRuleId,
  )
  if (onlyDispatchConfirmationOutstanding && awaitingDispatcher) return 'READY_TO_DISPATCH'
  if (openHumanTasks.length > 0) return 'AWAITING_HUMAN'
  return 'ON_HOLD'
}
