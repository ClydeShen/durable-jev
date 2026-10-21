import type { CheckResult, HumanTask, OrderStatus, Role } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { roleLabels } from './roles.js'

export type AttentionItem = { key: string; label: string; detail: string; yours?: boolean }

export type Attention = {
  headline: string
  waiting: AttentionItem[]
  failed: AttentionItem[]
}

const headlines: Record<OrderStatus, string> = {
  SUBMITTED: 'Submitted. The checks have not run yet.',
  EVALUATING: 'The checks are running.',
  AWAITING_HUMAN: 'Waiting for people before this order can move on.',
  ON_HOLD: 'On hold: a check failed, so approvals alone cannot release it.',
  READY_TO_DISPATCH: 'Every check passed. The dispatcher can confirm and release it.',
  DISPATCHED: 'Dispatched. Nothing is left to do.',
  REJECTED: 'Rejected. Nothing is left to do.',
  TECHNICAL_FAILURE:
    'A service was unavailable, so the checks could not finish. Re-evaluate once it is back.',
}

const titleOf = (rules: ReadonlyMap<string, RuleDefinition>, ruleId: string) =>
  rules.get(ruleId)?.title ?? ruleId

// What a person looking at the order needs first: why it is stuck and who can move it.
export function attentionFor(input: {
  orderStatus: OrderStatus
  humanTasks: readonly HumanTask[]
  checks: readonly CheckResult[]
  rules: readonly RuleDefinition[]
  actingRole: Role
}): Attention {
  const rules = new Map(input.rules.map((rule) => [rule.ruleId as string, rule]))
  const waiting = input.humanTasks
    .filter((task) => task.status === 'OPEN')
    .map((task) => ({
      key: task.humanTaskId,
      label: `${task.ruleId} ${titleOf(rules, task.ruleId)}`,
      detail: roleLabels[task.requiredRole],
      yours: task.requiredRole === input.actingRole,
    }))
  // Combiner gates (cargo ready, dispatch) fail because something below them failed:
  // name the checks that actually failed, once per rule.
  const failedRules = new Set<string>()
  const failed: AttentionItem[] = []
  for (const check of input.checks) {
    const ruleId = check.ruleId as string
    const isGate = rules.get(ruleId)?.evaluator.kind === 'combinator'
    if (check.gateStatus !== 'FAIL' || isGate || failedRules.has(ruleId)) continue
    failedRules.add(ruleId)
    failed.push({
      key: ruleId,
      label: `${ruleId} ${titleOf(rules, ruleId)}`,
      detail: check.subject.scope === 'order' ? 'order' : String(check.subject.entityId),
    })
  }
  return { headline: headlines[input.orderStatus], waiting, failed }
}
