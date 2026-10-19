import type { GateStatus, HumanTask, OrderStatus, RuleId } from '@durable-jev/contracts'
import type { RuleEvaluation } from '@durable-jev/rule-engine'

export const finalGateRuleId = 'R40' as RuleId
export const dispatchConfirmationRuleId = 'R39-CONFIRM' as RuleId
const gatesSettledByDispatch = new Set<string>([dispatchConfirmationRuleId, 'R39', finalGateRuleId])

const isSettledPositively = (status: GateStatus) => status === 'PASS' || status === 'NOT_APPLICABLE'

export function deriveOrderStatus(input: {
  evaluations: readonly RuleEvaluation[]
  finalGateStatus: GateStatus
  openHumanTasks: readonly HumanTask[]
}): OrderStatus {
  const { evaluations, finalGateStatus, openHumanTasks } = input
  if (finalGateStatus === 'ERROR') return 'TECHNICAL_FAILURE'
  if (finalGateStatus === 'FAIL') return 'ON_HOLD'

  const onlyDispatchConfirmationOutstanding = evaluations
    .filter((evaluation) => !gatesSettledByDispatch.has(evaluation.ruleId))
    .every((evaluation) => isSettledPositively(evaluation.gateStatus))
  const awaitingDispatcher = openHumanTasks.some(
    (task) => task.ruleId === dispatchConfirmationRuleId,
  )
  if (onlyDispatchConfirmationOutstanding && awaitingDispatcher) return 'READY_TO_DISPATCH'
  if (openHumanTasks.length > 0) return 'AWAITING_HUMAN'
  return 'ON_HOLD'
}
