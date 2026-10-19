import {
  cargoItemOf,
  type LeafRule,
  legsInSequence,
  minutesBetween,
  numericParameter,
  outcome,
  passOrFail,
  sortedDescending,
} from './leaf-helpers.js'

const requiredFieldsPresent: LeafRule = (_subject, { shipment }) => {
  const missing = [
    shipment.cargoItems.length === 0 && 'cargoItems',
    shipment.legs.length === 0 && 'legs',
  ].filter(Boolean)
  return passOrFail(missing.length === 0, { missing })
}

const weightAndDimensionsValid: LeafRule = (subject, inputs) => {
  const item = cargoItemOf(subject, inputs)
  if (!item) return outcome('UNKNOWN')
  const maxWeight = numericParameter(inputs.policy, 'maxCargoItemWeightGrams')
  const maxDimension = numericParameter(inputs.policy, 'maxCargoItemDimensionMm')
  const dimensions = [item.lengthMm, item.widthMm, item.heightMm]
  return passOrFail(
    item.weightGrams <= maxWeight && dimensions.every((dimension) => dimension <= maxDimension),
    { weightGrams: item.weightGrams, dimensionsMm: dimensions },
  )
}

const declaredCategoryMatchesDescription: LeafRule = (subject, inputs) => {
  const answer = inputs.semanticAnswerFor('R03', subject.entityId)
  if (answer?.type !== 'noul') return outcome('UNKNOWN', { answer: answer ?? null })
  const passAtLeast = numericParameter(inputs.policy, 'semanticNoulPassAtLeast')
  const failAtMost = numericParameter(inputs.policy, 'semanticNoulFailAtMost')
  const observedValue = { matchesDescription: answer.noul }
  if (answer.noul >= passAtLeast) return outcome('PASS', observedValue)
  if (answer.noul <= failAtMost) return outcome('FAIL', observedValue)
  return outcome('UNKNOWN', observedValue)
}

const cargoBranchDetermined: LeafRule = (subject, inputs) => {
  const item = cargoItemOf(subject, inputs)
  if (!item) return outcome('UNKNOWN')
  const categories = new Set(item.declaredCategories)
  const coldChainIncomplete = categories.has('COLD_CHAIN') && !item.temperatureRange
  const controlledIncomplete = categories.has('CONTROLLED') && !item.controlledClass
  if (coldChainIncomplete || controlledIncomplete)
    return outcome('UNKNOWN', { categories: [...categories] })
  const branch =
    categories.has('COLD_CHAIN') && categories.has('CONTROLLED')
      ? 'MIXED'
      : categories.has('COLD_CHAIN')
        ? 'COLD_CHAIN'
        : categories.has('CONTROLLED')
          ? 'CONTROLLED'
          : 'GENERAL'
  return outcome('PASS', { branch })
}

const fitsVehicleCapacity: LeafRule = (subject, inputs) => {
  const item = cargoItemOf(subject, inputs)
  if (!item || inputs.shipment.legs.length === 0) return outcome('UNKNOWN')
  const totalWeightGrams = inputs.shipment.cargoItems.reduce(
    (sum, cargo) => sum + cargo.weightGrams,
    0,
  )
  const itemDimensions = sortedDescending([item.lengthMm, item.widthMm, item.heightMm])
  const perVehicle = inputs.shipment.legs.map((leg) => {
    const vehicle = inputs.referenceData.vehicles.find((known) => known.vehicleId === leg.vehicleId)
    if (!vehicle) return { vehicleId: leg.vehicleId, fits: undefined }
    const spaceDimensions = sortedDescending([
      vehicle.cargoLengthMm,
      vehicle.cargoWidthMm,
      vehicle.cargoHeightMm,
    ])
    const fits =
      totalWeightGrams <= vehicle.maxPayloadGrams &&
      itemDimensions.every((dimension, index) => dimension <= (spaceDimensions[index] ?? 0))
    return { vehicleId: leg.vehicleId, fits }
  })
  if (perVehicle.some((vehicle) => vehicle.fits === undefined))
    return outcome('UNKNOWN', { perVehicle })
  return passOrFail(
    perVehicle.every((vehicle) => vehicle.fits),
    { totalWeightGrams, perVehicle },
  )
}

const arrivalWithinDeliveryWindow: LeafRule = (_subject, inputs) => {
  const finalLeg = legsInSequence(inputs).at(-1)
  if (!finalLeg) return outcome('UNKNOWN')
  const toleranceMinutes = numericParameter(inputs.policy, 'deliveryWindowToleranceMinutes')
  const { earliestAt, latestAt } = inputs.shipment.deliveryWindow
  const arrivesAt = finalLeg.plannedArrivalAt
  return passOrFail(
    minutesBetween(earliestAt, arrivesAt) >= -toleranceMinutes &&
      minutesBetween(arrivesAt, latestAt) >= -toleranceMinutes,
    { arrivesAt, earliestAt, latestAt },
  )
}

const legSequenceConnects: LeafRule = (_subject, inputs) => {
  const legs = legsInSequence(inputs)
  if (legs.length === 0) return outcome('UNKNOWN')
  const minConnectionMinutes = numericParameter(inputs.policy, 'minLegConnectionMinutes')
  const problems: string[] = []
  if (legs[0]?.fromLocation !== inputs.shipment.origin)
    problems.push('first leg does not start at origin')
  if (legs.at(-1)?.toLocation !== inputs.shipment.destination) {
    problems.push('last leg does not end at destination')
  }
  legs.forEach((leg, index) => {
    if (leg.sequence !== index + 1) problems.push(`leg ${leg.legId} sequence is not ${index + 1}`)
    if (minutesBetween(leg.plannedDepartureAt, leg.plannedArrivalAt) <= 0) {
      problems.push(`leg ${leg.legId} arrives before it departs`)
    }
    const next = legs[index + 1]
    if (!next) return
    if (leg.toLocation !== next.fromLocation) problems.push(`leg ${next.legId} does not connect`)
    if (minutesBetween(leg.plannedArrivalAt, next.plannedDepartureAt) < minConnectionMinutes) {
      problems.push(
        `connection before ${next.legId} is shorter than ${minConnectionMinutes} minutes`,
      )
    }
  })
  return passOrFail(problems.length === 0, { problems })
}

const noVersionConflict: LeafRule = (_subject, { shipment, storedVersions }) => {
  const sameRevision = shipment.caseRevision === storedVersions.caseRevision
  const sameEntities =
    JSON.stringify(shipment.entityVersions) === JSON.stringify(storedVersions.entityVersions)
  return passOrFail(sameRevision && sameEntities, {
    evaluatedRevision: shipment.caseRevision,
    storedRevision: storedVersions.caseRevision,
  })
}

export const baseLeafRules: Readonly<Record<string, LeafRule>> = {
  requiredFieldsPresent,
  weightAndDimensionsValid,
  declaredCategoryMatchesDescription,
  cargoBranchDetermined,
  fitsVehicleCapacity,
  arrivalWithinDeliveryWindow,
  legSequenceConnects,
  noVersionConflict,
}
