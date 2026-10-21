import { type CaseView, CoordinatorError } from '@durable-jev/coordinator'
import { loadPolicyParameters, loadRuleSetFile, readMaterial } from '@durable-jev/eval-runner'
import { buildRuleConfiguration, InvalidRuleConfigurationError } from '@durable-jev/rule-evaluation'
import { type FaultScenario, Observations } from '../fault.types.js'
import { coordinatorInProcess, submit } from '../faults.fixture.js'

const openTask = (view: CaseView, ruleId: string) =>
  view.humanTasks.find((task) => task.ruleId === ruleId && task.status === 'OPEN')
const gate = (view: CaseView, ruleId: string, entityId?: string) =>
  view.checks.find(
    (check) =>
      check.ruleId === ruleId && (entityId === undefined || check.subject.entityId === entityId),
  )?.gateStatus
const refusal = (error: unknown) => (error instanceof CoordinatorError ? error.code : String(error))

export const f11: FaultScenario = {
  id: 'F11',
  title: 'Someone without the role tries to approve',
  expectation: 'Refused; the task waits for the right person',
  async run() {
    const seen = new Observations()
    const coordinator = coordinatorInProcess()
    const view = await submit(coordinator, 'LOG-003')
    const task = openTask(view, 'R10')
    const attempt = await coordinator
      .approveHumanTask(task?.humanTaskId ?? '', 'COMMERCIAL_MANAGER')
      .catch((error) => error)
    seen.check(
      refusal(attempt) === 'FORBIDDEN',
      'a commercial manager approving the compliance review is FORBIDDEN',
    )
    seen.check(
      openTask(coordinator.getCase(view.caseId), 'R10')?.humanTaskId === task?.humanTaskId,
      'the same task is still open for the compliance reviewer',
    )
    await coordinator.approveHumanTask(task?.humanTaskId ?? '', 'COMPLIANCE_REVIEWER')
    seen.check(
      gate(coordinator.getCase(view.caseId), 'R10') === 'PASS',
      'the compliance reviewer can approve it',
    )
    return seen.result()
  },
}

export const f12: FaultScenario = {
  id: 'F12',
  title: 'An approval is given after its deadline',
  expectation: 'The expired request cannot be used; a fresh request is issued',
  async run() {
    const seen = new Observations()
    let now = Date.parse('2026-11-02T08:00:00.000Z')
    const coordinator = coordinatorInProcess({ now: () => new Date(now).toISOString() })
    const view = await submit(coordinator, 'LOG-003')
    const task = openTask(view, 'R10')
    seen.note(`R10 review requested, due ${task?.expiresAt}`)
    now += 241 * 60_000
    const late = await coordinator
      .approveHumanTask(task?.humanTaskId ?? '', 'COMPLIANCE_REVIEWER')
      .catch((error) => error)
    seen.check(
      refusal(late) === 'CONFLICT' && String(late.message).includes('EXPIRED'),
      'approving 4 h 1 min later is refused as EXPIRED',
    )
    const after = await coordinator.reevaluate(view.caseId)
    const fresh = openTask(after, 'R10')
    seen.check(
      after.humanTasks.find((candidate) => candidate.humanTaskId === task?.humanTaskId)?.status ===
        'EXPIRED',
      'the old request is marked EXPIRED',
    )
    seen.check(
      fresh !== undefined && fresh.humanTaskId !== task?.humanTaskId,
      `a fresh request ${fresh?.humanTaskId} is open`,
    )
    seen.check(gate(after, 'R10') === 'WAITING_HUMAN', 'R10 is still waiting, not passed')
    return seen.result()
  },
}

export const f13: FaultScenario = {
  id: 'F13',
  title: 'A sign-off for the old carrier arrives after the reassignment',
  expectation: 'The late sign-off is refused and the new plan needs its own',
  async run() {
    const seen = new Observations()
    const coordinator = coordinatorInProcess()
    const view = await submit(coordinator, 'LOG-004')
    const oldTask = openTask(view, 'R13')
    seen.check(oldTask !== undefined, 'LOG-004 waits for the compliance sign-off (R13)')
    const changed = await coordinator.applyChange(
      view.caseId,
      {
        kind: 'changeCarrier',
        legId: 'LOG-004-LEG-1' as never,
        carrierId: 'CAR-GLACIER' as never,
        vehicleId: 'VEH-GL-REEFER-4T' as never,
      },
      'TRANSPORT_PLANNER',
    )
    const late = await coordinator
      .approveHumanTask(oldTask?.humanTaskId ?? '', 'COMPLIANCE_REVIEWER')
      .catch((error) => error)
    seen.check(
      refusal(late) === 'CONFLICT',
      `the sign-off on ${oldTask?.humanTaskId} is refused (${late?.message ?? ''})`,
    )
    const current = coordinator.getCase(view.caseId)
    const newTask = openTask(current, 'R13')
    seen.check(
      newTask !== undefined && newTask.humanTaskId !== oldTask?.humanTaskId,
      `a new sign-off ${newTask?.humanTaskId} is requested for r${changed.shipment.caseRevision}`,
    )
    seen.check(gate(current, 'R13') === 'WAITING_HUMAN', 'R13 is waiting, not passed')
    return seen.result()
  },
}

export const f14: FaultScenario = {
  id: 'F14',
  title: 'A field action is completed without its evidence',
  expectation: 'Refused; the next step stays blocked',
  async run() {
    const seen = new Observations()
    const coordinator = coordinatorInProcess()
    const view = await submit(coordinator, 'LOG-002')
    const repack = openTask(view, 'R21')
    const attempt = await coordinator
      .completeHumanTask(repack?.humanTaskId ?? '', 'WAREHOUSE_OPERATOR', {})
      .catch((error) => error)
    seen.check(
      refusal(attempt) === 'UNPROCESSABLE',
      'completing the repack without its fields is UNPROCESSABLE',
    )
    const after = coordinator.getCase(view.caseId)
    seen.check(
      openTask(after, 'R21')?.humanTaskId === repack?.humanTaskId,
      'the repack task is still open',
    )
    seen.check(gate(after, 'R22-CAPTURE') === 'BLOCKED_DEPENDENCY', 'the retest stays blocked')
    return seen.result()
  },
}

export const f15: FaultScenario = {
  id: 'F15',
  title: 'Two plan changes for the same order at the same time',
  expectation: 'One applies; the other, based on the old revision, is refused',
  async run() {
    const seen = new Observations()
    const coordinator = coordinatorInProcess()
    const view = await submit(coordinator, 'LOG-005')
    const results = await Promise.allSettled([
      coordinator.applyChange(
        view.caseId,
        { kind: 'changeQuote', amountCents: 200_000 },
        'COMMERCIAL_MANAGER',
        1,
      ),
      coordinator.applyChange(
        view.caseId,
        { kind: 'changeQuote', amountCents: 260_000 },
        'COMMERCIAL_MANAGER',
        1,
      ),
    ])
    const applied = results.filter((result) => result.status === 'fulfilled').length
    const refused = results.filter(
      (result) => result.status === 'rejected' && refusal(result.reason) === 'CONFLICT',
    ).length
    seen.check(
      applied === 1 && refused === 1,
      `one change applied, one refused as CONFLICT (${applied}/${refused})`,
    )
    const current = coordinator.getCase(view.caseId)
    seen.check(current.shipment.caseRevision === 2, 'the order is at revision 2, not 3')
    seen.check(current.changes.length === 1, 'one change in the revision history')
    return seen.result()
  },
}

export const f16: FaultScenario = {
  id: 'F16',
  title: 'The rule configuration has a cycle or a missing dependency',
  expectation: 'The configuration is rejected before anything can be released',
  async run() {
    const seen = new Observations()
    const ruleSet = loadRuleSetFile()
    const broken = {
      ...ruleSet,
      rules: (ruleSet.rules as { ruleId: string; dependsOn?: string[] }[]).map((rule) =>
        rule.ruleId === 'R01'
          ? { ...rule, dependsOn: ['R40'] }
          : rule.ruleId === 'R02'
            ? { ...rule, dependsOn: [...(rule.dependsOn ?? []), 'R99'] }
            : rule,
      ),
    }
    let issues: { kind: string }[] = []
    try {
      buildRuleConfiguration(broken, loadPolicyParameters() as never, {
        mixingMatrix: readMaterial('decision-tables/mixing-matrix.json'),
        semanticQuestions: readMaterial('semantic-questions.json'),
      })
    } catch (error) {
      if (error instanceof InvalidRuleConfigurationError)
        issues = [...error.issues] as { kind: string }[]
    }
    const kinds = [...new Set(issues.map((issue) => issue.kind))]
    seen.check(issues.length > 0, `the configuration was rejected (${kinds.join(', ')})`)
    seen.check(
      kinds.some((kind) => /cycle/i.test(kind)),
      'the cycle R01 → R40 → … → R01 is reported',
    )
    seen.check(
      kinds.some((kind) => /missing|unknown/i.test(kind)),
      'the missing dependency R99 is reported',
    )
    return seen.result()
  },
}

export const f17: FaultScenario = {
  id: 'F17',
  title: 'One leg of a multi-leg order fails',
  expectation: 'The whole order cannot be dispatched',
  async run() {
    const seen = new Observations()
    const coordinator = coordinatorInProcess()
    const view = await submit(coordinator, 'LOG-007')
    seen.check(gate(view, 'R26', 'LOG-007-LEG-1') === 'FAIL', 'the transfer hub fails for leg 1')
    seen.check(gate(view, 'R40') !== 'PASS', `the order gate R40 is ${gate(view, 'R40')}`)
    seen.check(view.orderStatus === 'ON_HOLD', 'the order is ON_HOLD')
    const attempt = await coordinator.dispatch(view.caseId, 'DISPATCHER').catch((error) => error)
    seen.check(
      refusal(attempt) === 'NOT_READY_TO_DISPATCH',
      'dispatch is refused (NOT_READY_TO_DISPATCH)',
    )
    return seen.result()
  },
}

export const f18: FaultScenario = {
  id: 'F18',
  title: 'The plan changes while dispatch is being confirmed',
  expectation: 'Dispatch is refused; nothing is released on the old revision',
  async run() {
    const seen = new Observations()
    let injected = false
    const coordinator = coordinatorInProcess({
      wrapEvaluators: (evaluators, current) =>
        evaluators.map((evaluator) =>
          evaluator.branches.includes('release')
            ? {
                ...evaluator,
                evaluate: async (request) => {
                  const confirming = request.humanGates.some(
                    (gateState) =>
                      gateState.ruleId === 'R39-CONFIRM' && gateState.status === 'PASS',
                  )
                  if (confirming && !injected) {
                    injected = true
                    // Another user changes the quote while the release check is running.
                    await current().applyChange(
                      request.caseId,
                      { kind: 'changeQuote', amountCents: 190_000 },
                      'COMMERCIAL_MANAGER',
                    )
                  }
                  return evaluator.evaluate(request)
                },
              }
            : evaluator,
        ),
    })
    const view = await submit(coordinator, 'LOG-001')
    await coordinator.completeHumanTask(
      openTask(view, 'R39-LOAD')?.humanTaskId ?? '',
      'WAREHOUSE_OPERATOR',
      {
        loadScanRef: 'SCAN-1',
        physicalCheckBy: 'op-2',
      },
    )
    const attempt = await coordinator.dispatch(view.caseId, 'DISPATCHER').catch((error) => error)
    seen.check(injected, 'a quote change landed during the dispatch check')
    // Either check in the commit transaction may fire first: the revision moved (CONFLICT),
    // or the change withdrew the open confirmation (NOT_READY_TO_DISPATCH). Both refuse.
    seen.check(
      ['CONFLICT', 'NOT_READY_TO_DISPATCH'].includes(refusal(attempt)),
      `dispatch was refused (${refusal(attempt)}: ${attempt?.message ?? ''})`,
    )
    const after = coordinator.getCase(view.caseId)
    seen.check(
      after.orderStatus !== 'DISPATCHED',
      `the order is ${after.orderStatus}, not dispatched`,
    )
    seen.check(after.shipment.caseRevision === 2, 'the order is at revision 2 with the new quote')
    return seen.result()
  },
}
