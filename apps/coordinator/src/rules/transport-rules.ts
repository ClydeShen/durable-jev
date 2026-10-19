import { type LeafRule, legOf, outcome, passOrFail } from './leaf-helpers.js'

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
  return passOrFail(vehicle.carrierId === leg.carrierId, { vehicleId: vehicle.vehicleId })
}

const activeReservationForPlan: LeafRule = (_subject, inputs) =>
  passOrFail(inputs.ensurePlanReservation(), { routeVersion: inputs.shipment.entityVersions.route })

export const transportLeafRules: Readonly<Record<string, LeafRule>> = {
  carrierServesLeg,
  vehicleFitsLeg,
  activeReservationForPlan,
}
