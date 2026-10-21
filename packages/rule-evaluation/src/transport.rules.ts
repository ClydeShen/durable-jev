import {
  type LeafRule,
  legOf,
  notApplicable,
  outcome,
  passOrFail,
  semanticNoulOutcome,
} from './leaf.helpers.js'

const carrierServesLeg: LeafRule = (subject, inputs) => {
  const leg = legOf(subject, inputs)
  const carrier = inputs.referenceData.carriers.find((known) => known.carrierId === leg?.carrierId)
  if (!leg || !carrier) return outcome('UNKNOWN')
  return passOrFail(
    carrier.serviceLocations.includes(leg.fromLocation) &&
      carrier.serviceLocations.includes(leg.toLocation),
    { carrierId: carrier.carrierId, fromLocation: leg.fromLocation, toLocation: leg.toLocation },
  )
}

const vehicleFitsLeg: LeafRule = (subject, inputs) => {
  const leg = legOf(subject, inputs)
  const vehicle = inputs.referenceData.vehicles.find((known) => known.vehicleId === leg?.vehicleId)
  if (!leg || !vehicle) return outcome('UNKNOWN')
  const needsTemperatureControl = inputs.shipment.cargoItems.some((item) =>
    item.declaredCategories.includes('COLD_CHAIN'),
  )
  const belongsToCarrier = vehicle.carrierId === leg.carrierId
  const hasTemperatureControl = vehicle.temperatureControl !== undefined
  return passOrFail(belongsToCarrier && (!needsTemperatureControl || hasTemperatureControl), {
    vehicleId: vehicle.vehicleId,
    belongsToCarrier,
    needsTemperatureControl,
    hasTemperatureControl,
  })
}

const hubSupportsCargo: LeafRule = (subject, inputs) => {
  const leg = legOf(subject, inputs)
  if (!leg) return outcome('UNKNOWN')
  if (leg.toLocation === inputs.shipment.destination) return notApplicable({ transfer: false })
  const hub = inputs.referenceData.hubs.find((known) => known.location === leg.toLocation)
  if (!hub) return outcome('FAIL', { location: leg.toLocation, hub: null })
  const categories = new Set(inputs.shipment.cargoItems.flatMap((item) => item.declaredCategories))
  const unsupported = [...categories].filter(
    (category) =>
      !hub.supportedCategories.includes(category) ||
      (category === 'COLD_CHAIN' && !hub.supportsColdChain),
  )
  return passOrFail(unsupported.length === 0, { hubId: hub.hubId, unsupported })
}

const customerRestrictionsAllowRoute: LeafRule = (_subject, inputs) => {
  if (!inputs.shipment.customerInstructions?.trim()) return notApplicable({ instructions: null })
  return semanticNoulOutcome('R27', 'order', inputs, 'routeAllowedByInstructions')
}

const alternativePlanChecks: LeafRule = () => notApplicable({ candidatePlan: null })

const activeReservationForPlan: LeafRule = (_subject, inputs) =>
  passOrFail(inputs.ensurePlanReservation(), { routeVersion: inputs.shipment.entityVersions.route })

export const transportLeafRules: Readonly<Record<string, LeafRule>> = {
  carrierServesLeg,
  vehicleFitsLeg,
  hubSupportsCargo,
  customerRestrictionsAllowRoute,
  alternativePlanChecks,
  activeReservationForPlan,
}
