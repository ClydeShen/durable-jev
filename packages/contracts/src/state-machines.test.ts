import { describe, expect, it } from 'vitest'
import {
  humanTaskMachine,
  InvalidTransitionError,
  orderStatusMachine,
  reservationMachine,
} from './index.js'

describe('orderStatusMachine', () => {
  it('only dispatches from READY_TO_DISPATCH', () => {
    expect(orderStatusMachine.canTransition('READY_TO_DISPATCH', 'DISPATCHED')).toBe(true)
    expect(orderStatusMachine.canTransition('AWAITING_HUMAN', 'DISPATCHED')).toBe(false)
    expect(orderStatusMachine.canTransition('ON_HOLD', 'DISPATCHED')).toBe(false)
  })

  it('never leaves a terminal status', () => {
    expect(orderStatusMachine.terminalStates).toEqual(['DISPATCHED', 'REJECTED'])
    expect(() => orderStatusMachine.transition('DISPATCHED', 'ON_HOLD')).toThrow(
      InvalidTransitionError,
    )
  })

  it('treats staying in the same status as a no-op', () => {
    expect(orderStatusMachine.transition('DISPATCHED', 'DISPATCHED')).toBe('DISPATCHED')
  })
})

describe('humanTaskMachine', () => {
  it('lets a decided task be superseded but not re-decided', () => {
    expect(humanTaskMachine.canTransition('APPROVED', 'SUPERSEDED')).toBe(true)
    expect(humanTaskMachine.canTransition('APPROVED', 'REJECTED')).toBe(false)
    expect(humanTaskMachine.canTransition('EXPIRED', 'APPROVED')).toBe(false)
  })

  it('ends in expired, cancelled or superseded', () => {
    expect(humanTaskMachine.terminalStates).toEqual(['EXPIRED', 'CANCELLED', 'SUPERSEDED'])
  })
})

describe('reservationMachine', () => {
  it('can only cancel a reservation once', () => {
    expect(reservationMachine.canTransition('RESERVED', 'CANCELLED')).toBe(true)
    expect(reservationMachine.canTransition('CANCELLED', 'RESERVED')).toBe(false)
  })
})
