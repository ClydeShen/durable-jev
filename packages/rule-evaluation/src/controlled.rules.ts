import { forbiddenMixes } from './decision-tables.rules.js'
import {
  cargoTokens,
  documentsFor,
  type LeafRule,
  outcome,
  passOrFail,
  semanticNoulOutcome,
} from './leaf.helpers.js'

const requiredControlledDocuments = ['SAFETY_DATA_SHEET', 'CONTROLLED_DECLARATION'] as const

const controlledDocumentsComplete: LeafRule = (subject, inputs) => {
  const presentKinds = new Set(
    documentsFor(subject, inputs)
      .filter((document) => document.text.trim().length > 0)
      .map((document) => document.kind),
  )
  const missing = requiredControlledDocuments.filter((kind) => !presentKinds.has(kind))
  return passOrFail(missing.length === 0, { missing })
}

const documentsMatchDescription: LeafRule = (subject, inputs) =>
  semanticNoulOutcome('R10', subject.entityId, inputs, 'documentsMatchDescription')

const carrierQualifiedForControlled: LeafRule = (_subject, inputs) => {
  if (inputs.shipment.legs.length === 0) return outcome('UNKNOWN')
  const perLeg = inputs.shipment.legs.map((leg) => {
    const carrier = inputs.referenceData.carriers.find((known) => known.carrierId === leg.carrierId)
    const qualification = carrier?.qualifications.find(
      (candidate) => candidate.category === 'CONTROLLED',
    )
    const validThroughArrival =
      qualification !== undefined &&
      Date.parse(qualification.validUntil) >= Date.parse(leg.plannedArrivalAt)
    return {
      legId: leg.legId,
      carrierId: leg.carrierId,
      validUntil: qualification?.validUntil,
      validThroughArrival,
    }
  })
  return passOrFail(
    perLeg.every((leg) => leg.validThroughArrival),
    { perLeg },
  )
}

const mixedLoadAllowed: LeafRule = (_subject, inputs) => {
  const tokens = new Set(inputs.shipment.cargoItems.flatMap(cargoTokens))
  const conflicts = forbiddenMixes(inputs.decisionTables.mixingMatrix, tokens)
  return passOrFail(conflicts.length === 0, {
    tokens: [...tokens],
    conflicts: conflicts.map((conflict) => conflict.reason),
  })
}

export const controlledLeafRules: Readonly<Record<string, LeafRule>> = {
  controlledDocumentsComplete,
  documentsMatchDescription,
  carrierQualifiedForControlled,
  mixedLoadAllowed,
}
