import { z } from 'zod'
import {
  CargoItemId,
  CarrierId,
  CaseId,
  CustomerId,
  LegId,
  ShipmentId,
  UtcTimestamp,
  VehicleId,
} from './ids.schema.js'

const nonNegativeInteger = z.int().nonnegative()
const positiveInteger = z.int().positive()

export const CargoCategory = z.enum(['GENERAL', 'COLD_CHAIN', 'CONTROLLED'])
export type CargoCategory = z.infer<typeof CargoCategory>

export const TemperatureRange = z
  .object({
    minDeciCelsius: z.int(),
    maxDeciCelsius: z.int(),
  })
  .refine((range) => range.minDeciCelsius <= range.maxDeciCelsius, {
    message: 'minDeciCelsius must not exceed maxDeciCelsius',
  })
export type TemperatureRange = z.infer<typeof TemperatureRange>

export const CargoItem = z.object({
  cargoItemId: CargoItemId,
  description: z.string(),
  declaredCategories: z.array(CargoCategory).min(1),
  controlledClass: z.string().optional(),
  weightGrams: positiveInteger,
  lengthMm: positiveInteger,
  widthMm: positiveInteger,
  heightMm: positiveInteger,
  temperatureRange: TemperatureRange.optional(),
  packagingId: z.string().min(1).optional(),
})
export type CargoItem = z.infer<typeof CargoItem>

export const TransportLeg = z.object({
  legId: LegId,
  sequence: positiveInteger,
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  carrierId: CarrierId,
  vehicleId: VehicleId,
  plannedDepartureAt: UtcTimestamp,
  plannedArrivalAt: UtcTimestamp,
})
export type TransportLeg = z.infer<typeof TransportLeg>

export const Quote = z.object({
  quoteId: z.string().min(1),
  amountCents: nonNegativeInteger,
  baselineAmountCents: nonNegativeInteger.optional(),
  currency: z.string().length(3),
})
export type Quote = z.infer<typeof Quote>

export const DeliveryWindow = z.object({
  earliestAt: UtcTimestamp,
  latestAt: UtcTimestamp,
})
export type DeliveryWindow = z.infer<typeof DeliveryWindow>

export const EntityVersions = z.object({
  cargo: positiveInteger,
  route: positiveInteger,
  carrier: positiveInteger,
  quote: positiveInteger,
})
export type EntityVersions = z.infer<typeof EntityVersions>
export type VersionedEntity = keyof EntityVersions

export const Shipment = z.object({
  caseId: CaseId,
  shipmentId: ShipmentId,
  customerId: CustomerId,
  caseRevision: positiveInteger,
  entityVersions: EntityVersions,
  origin: z.string().min(1),
  destination: z.string().min(1),
  deliveryWindow: DeliveryWindow,
  cargoItems: z.array(CargoItem),
  legs: z.array(TransportLeg).max(3),
  quote: Quote,
  customerInstructions: z.string().optional(),
})
export type Shipment = z.infer<typeof Shipment>
