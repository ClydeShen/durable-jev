import type { CargoItem, CheckSubject, GateStatus, TransportLeg } from '@durable-jev/contracts'
import type { LeafOutcome } from '@durable-jev/rule-engine'
import type { EvaluationInputs, PolicyParameters } from './evaluation-inputs.types.js'

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

export const notApplicable = (observedValue?: unknown) => outcome('NOT_APPLICABLE', observedValue)

export const conditionHolds = (holds: boolean, observedValue?: unknown) =>
  outcome(holds ? 'PASS' : 'NOT_APPLICABLE', observedValue)

export function semanticNoulOutcome(
  ruleId: string,
  entityId: string,
  inputs: EvaluationInputs,
  observedKey: string,
): LeafOutcome {
  const answer = inputs.semanticAnswerFor(ruleId, entityId)
  if (answer?.type !== 'noul') return outcome('UNKNOWN', { answer: answer ?? null })
  const passAtLeast = numericParameter(inputs.policy, 'semanticNoulPassAtLeast')
  const failAtMost = numericParameter(inputs.policy, 'semanticNoulFailAtMost')
  // Jev returns two decimals, so a reading right on a line could fall either side of it from
  // one run to the next. Readings within the review band of a line go to a person instead.
  const reviewBand =
    typeof inputs.policy.semanticNoulReviewBand === 'number'
      ? inputs.policy.semanticNoulReviewBand
      : 0
  const tolerance = 1e-9
  const observedValue = { [observedKey]: answer.noul }
  if (answer.noul + tolerance >= passAtLeast + reviewBand) return outcome('PASS', observedValue)
  if (answer.noul - tolerance <= failAtMost - reviewBand) return outcome('FAIL', observedValue)
  const nearLine =
    Math.abs(answer.noul - passAtLeast) <= reviewBand + tolerance ||
    Math.abs(answer.noul - failAtMost) <= reviewBand + tolerance
  return outcome('UNKNOWN', nearLine ? { ...observedValue, nearThreshold: true } : observedValue)
}

export type ConfidentChoice = { choice: string; probability: number }

export function confidentChoice(
  ruleId: string,
  entityId: string,
  inputs: EvaluationInputs,
): ConfidentChoice | undefined {
  const answer = inputs.semanticAnswerFor(ruleId, entityId)
  if (answer?.type !== 'choice') return undefined
  const probability = answer.probabilities[answer.choice] ?? 0
  const minimum = numericParameter(inputs.policy, 'semanticChoiceMinProbability')
  return probability >= minimum ? { choice: answer.choice, probability } : undefined
}

export function documentsFor(subject: CheckSubject, inputs: EvaluationInputs) {
  return inputs.evidence.documents.filter((document) => document.cargoItemId === subject.entityId)
}

export function temperatureLogFor(subject: CheckSubject, inputs: EvaluationInputs) {
  return inputs.evidence.temperatureLogs.find((log) => log.cargoItemId === subject.entityId)
}

export function cargoTokens(item: CargoItem): string[] {
  return item.declaredCategories.map((category) =>
    category === 'CONTROLLED' && item.controlledClass
      ? `CONTROLLED:${item.controlledClass}`
      : category,
  )
}
