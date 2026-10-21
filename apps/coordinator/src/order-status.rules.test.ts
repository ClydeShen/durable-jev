import { orderStatusMachine } from '@durable-jev/contracts'
import type { RuleEvaluation } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { deriveOrderStatus, gatesBeforeDispatchConfirmation } from './order-status.js'

const passing = (ruleId: string): RuleEvaluation =>
  ({
    ruleId,
    subject: { scope: 'order', entityId: 'order' },
    gateStatus: 'PASS',
    blockedBy: [],
  }) as never

describe('deriveOrderStatus', () => {
  it('is READY_TO_DISPATCH once the final gate passes, so dispatch is a legal transition', () => {
    const derived = deriveOrderStatus({
      evaluations: ['R30', 'R39', 'R40'].map(passing),
      finalGateStatus: 'PASS',
      openHumanTasks: [],
      gatesBeforeConfirmation: ['R30'],
    })
    expect(derived).toBe('READY_TO_DISPATCH')
    expect(orderStatusMachine.canTransition(derived, 'DISPATCHED')).toBe(true)
  })

  it('holds the order when the final gate fails', () => {
    expect(
      deriveOrderStatus({
        evaluations: [],
        finalGateStatus: 'FAIL',
        openHumanTasks: [],
        gatesBeforeConfirmation: [],
      }),
    ).toBe('ON_HOLD')
  })

  it('is ready to dispatch when only the confirmation is open, even if a recovered rule failed', () => {
    const failed = (ruleId: string) => ({ ...passing(ruleId), gateStatus: 'FAIL' as const })
    const derived = deriveOrderStatus({
      evaluations: [passing('R36'), passing('R39-LOAD'), failed('R32')],
      finalGateStatus: 'BLOCKED_DEPENDENCY',
      openHumanTasks: [{ ruleId: 'R39-CONFIRM', status: 'OPEN' }] as never,
      gatesBeforeConfirmation: ['R36', 'R39-LOAD'],
    })
    expect(derived).toBe('READY_TO_DISPATCH')
  })
})

describe('gatesBeforeDispatchConfirmation', () => {
  it('lists what feeds release apart from the confirmation itself', () => {
    const rule = (ruleId: string, operands: string[]) =>
      ({
        ruleId,
        dependsOn: [],
        combiner: { kind: 'and', operands: operands.map((ref) => ({ kind: 'ref', ruleId: ref })) },
      }) as never
    expect(
      gatesBeforeDispatchConfirmation([
        rule('R39', ['R39-LOAD', 'R39-CONFIRM']),
        rule('R40', ['R08', 'R36', 'R39']),
      ]).sort(),
    ).toEqual(['R08', 'R36', 'R39-LOAD'])
  })
})
