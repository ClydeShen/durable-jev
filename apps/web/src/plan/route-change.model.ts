import type { PlanChange, Shipment } from '@durable-jev/contracts'

const transferMinutes = 45
const minute = 60_000

// The planner picks a transfer hub; the route becomes two legs on the first leg's carrier and
// vehicle. The time between first departure and last arrival is split evenly around a short
// transfer, so the schedule stays inside what was planned.
export const routeThroughHub = (
  shipment: Shipment,
  hubLocation: string,
): Extract<PlanChange, { kind: 'replaceLegs' }> => {
  const first = shipment.legs[0]
  const last = shipment.legs[shipment.legs.length - 1]
  if (!first || !last) throw new Error('the order has no legs')
  const departure = Date.parse(first.plannedDepartureAt)
  const arrival = Date.parse(last.plannedArrivalAt)
  const legMs = (arrival - departure - transferMinutes * minute) / 2
  const at = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')
  const secondLegId = first.legId.replace(/-LEG-\d+$/, '-LEG-2')
  return {
    kind: 'replaceLegs',
    legs: [
      {
        ...first,
        sequence: 1,
        fromLocation: first.fromLocation,
        toLocation: hubLocation,
        plannedDepartureAt: at(departure),
        plannedArrivalAt: at(departure + legMs),
      },
      {
        ...first,
        legId: secondLegId as typeof first.legId,
        sequence: 2,
        fromLocation: hubLocation,
        toLocation: last.toLocation,
        plannedDepartureAt: at(departure + legMs + transferMinutes * minute),
        plannedArrivalAt: at(arrival),
      },
    ],
  }
}

export const hubChoices = (shipment: Shipment, hubs: readonly { location: string }[]): string[] => {
  const last = shipment.legs[shipment.legs.length - 1]
  const ends = new Set([shipment.legs[0]?.fromLocation, last?.toLocation])
  return hubs.map((hub) => hub.location).filter((location) => !ends.has(location))
}
