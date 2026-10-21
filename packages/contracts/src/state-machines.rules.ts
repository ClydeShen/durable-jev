import type { HumanTaskStatus } from './human-task.schema.js'
import type { InvestigationStatus } from './investigation.schema.js'
import { defineStateMachine } from './state-machine.types.js'
import type { OrderStatus } from './statuses.schema.js'

const reEvaluableOrderStatuses = [
  'EVALUATING',
  'ON_HOLD',
  'AWAITING_HUMAN',
  'READY_TO_DISPATCH',
  'TECHNICAL_FAILURE',
  'REJECTED',
] as const satisfies readonly OrderStatus[]

const otherThan = (status: OrderStatus) =>
  reEvaluableOrderStatuses.filter((candidate) => candidate !== status)

export const orderStatusMachine = defineStateMachine<OrderStatus>({
  name: 'order',
  initial: 'SUBMITTED',
  transitions: {
    SUBMITTED: reEvaluableOrderStatuses,
    EVALUATING: otherThan('EVALUATING'),
    ON_HOLD: otherThan('ON_HOLD'),
    AWAITING_HUMAN: otherThan('AWAITING_HUMAN'),
    READY_TO_DISPATCH: [...otherThan('READY_TO_DISPATCH'), 'DISPATCHED'],
    TECHNICAL_FAILURE: otherThan('TECHNICAL_FAILURE'),
    DISPATCHED: [],
    REJECTED: [],
  },
})

export const humanTaskMachine = defineStateMachine<HumanTaskStatus>({
  name: 'humanTask',
  initial: 'OPEN',
  transitions: {
    OPEN: ['APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'],
    APPROVED: ['SUPERSEDED'],
    REJECTED: ['SUPERSEDED'],
    COMPLETED: ['SUPERSEDED'],
    EXPIRED: [],
    CANCELLED: [],
    SUPERSEDED: [],
  },
})

export type ReservationStatus = 'RESERVED' | 'CANCELLED'

export const reservationMachine = defineStateMachine<ReservationStatus>({
  name: 'reservation',
  initial: 'RESERVED',
  transitions: {
    RESERVED: ['CANCELLED'],
    CANCELLED: [],
  },
})

export const investigationMachine = defineStateMachine<InvestigationStatus>({
  name: 'investigation',
  initial: 'RUNNING',
  transitions: {
    RUNNING: ['PROPOSED', 'NO_CANDIDATE', 'ESCALATED', 'STALE'],
    PROPOSED: ['ACCEPTED', 'REJECTED', 'STALE'],
    NO_CANDIDATE: [],
    ESCALATED: [],
    ACCEPTED: [],
    REJECTED: [],
    STALE: [],
  },
})
