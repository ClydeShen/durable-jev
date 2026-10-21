import type { ObservedResult, ScriptedStep } from '@durable-jev/agent-harness'
import type { PlanCheck } from './reroute-plan.js'

type CaseResult = { incident: { legId: string } }
type OfferResult = { offerId: string }
type CheckResult = { offerId: string; passes: boolean; checks: PlanCheck[] }

const resultOf = <T>(results: readonly ObservedResult[], tool: string) =>
  results.find((result) => result.tool === tool)?.result as T | undefined

function failedRules(check: CheckResult): string {
  return check.checks
    .filter((rule) => rule.status !== 'PASS' && rule.status !== 'NOT_APPLICABLE')
    .map((rule) => rule.ruleId)
    .join('、')
}

/**
 * Stands in for the model when no real model is allowed: read the case, list offers, pre-check
 * them cheapest first and propose the first that passes, escalating when none does.
 */
export function scriptedRerouter(results: readonly ObservedResult[]): ScriptedStep {
  const caseResult = resultOf<CaseResult>(results, 'get_case')
  if (!caseResult) return { call: 'get_case', args: {} }
  const offers = resultOf<OfferResult[]>(results, 'search_capacity_offers')
  if (!offers) {
    return { call: 'search_capacity_offers', args: { legId: caseResult.incident.legId } }
  }
  if (resultOf(results, 'submit_investigation_result')) {
    return { answer: '调查结果已提交，等待计划员确认。' }
  }
  const checked = results
    .filter((result) => result.tool === 'check_plan')
    .map((result) => result.result as CheckResult)
  const rejected = checked
    .filter((check) => !check.passes)
    .map((check) => `${check.offerId} 未通过 ${failedRules(check)}`)
  const passing = checked.find((check) => check.passes)
  if (passing) {
    return {
      call: 'submit_investigation_result',
      args: {
        decision: 'propose',
        offerId: passing.offerId,
        rationale: [...rejected, `${passing.offerId} 是最便宜且预检全部通过的方案`].join('；'),
      },
    }
  }
  const next = offers.find((offer) => !checked.some((check) => check.offerId === offer.offerId))
  if (next) return { call: 'check_plan', args: { offerId: next.offerId } }
  return {
    call: 'submit_investigation_result',
    args: { decision: 'escalate', rationale: ['没有通过预检的备选运力', ...rejected].join('；') },
  }
}
