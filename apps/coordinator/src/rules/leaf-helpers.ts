import type { CargoItem, CheckSubject, GateStatus, TransportLeg } from '@durable-jev/contracts'
import type { LeafOutcome } from '@durable-jev/rule-engine'
import type { EvaluationInputs, PolicyParameters } from './evaluation-inputs.js'

export type LeafRule = (subject: CheckSubject, inputs: EvaluationInputs) => LeafOutcome

export const outcome = (gateStatus: GateStatus, observedValue?: unknown): LeafOutcome =>
  observedValue === undefined ? { gateStatus } : { gateStatus, observedValue }

export const passOrFail = (condition: boolean, observedValue?: unknown) =>
  outcome(condition ? 'PASS' : 'FAIL', observedValue)

export function numericParameter(policy: PolicyParameters, name: string): number {
  const value = policy[name]
  if (typeof value !== 'number') throw new Error(`policy parameter ${name} must be a number`)
  return value
}

export function cargoItemOf(
  subject: CheckSubject,
  inputs: EvaluationInputs,
): CargoItem | undefined {
  return inputs.shipment.cargoItems.find((item) => item.cargoItemId === subject.entityId)
}

export function legOf(subject: CheckSubject, inputs: EvaluationInputs): TransportLeg | undefined {
  return inputs.shipment.legs.find((leg) => leg.legId === subject.entityId)
}

export function legsInSequence(inputs: EvaluationInputs): TransportLeg[] {
  return [...inputs.shipment.legs].sort((left, right) => left.sequence - right.sequence)
}

export const minutesBetween = (earlier: string, later: string) =>
  (Date.parse(later) - Date.parse(earlier)) / 60_000

export const sortedDescending = (values: number[]) =>
  [...values].sort((left, right) => right - left)
