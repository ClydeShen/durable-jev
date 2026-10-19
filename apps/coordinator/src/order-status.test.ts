import { orderStatusMachine } from '@durable-jev/contracts'
import type { RuleEvaluation } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { deriveOrderStatus } from './order-status.js'

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
    })
    expect(derived).toBe('READY_TO_DISPATCH')
    expect(orderStatusMachine.canTransition(derived, 'DISPATCHED')).toBe(true)
  })

  it('holds the order when the final gate fails', () => {
    expect(
      deriveOrderStatus({ evaluations: [], finalGateStatus: 'FAIL', openHumanTasks: [] }),
    ).toBe('ON_HOLD')
  })
})
