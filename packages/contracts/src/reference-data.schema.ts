import { z } from 'zod'
import { CarrierId, CustomerId, UtcTimestamp, VehicleId } from './ids.js'
import { CargoCategory, TemperatureRange } from './shipment.js'

const positiveInteger = z.int().positive()
const nonNegativeInteger = z.int().nonnegative()

export const CarrierQualification = z.object({
  category: CargoCategory,
  validUntil: UtcTimestamp,
})
export type CarrierQualification = z.infer<typeof CarrierQualification>

export const Carrier = z.object({
  carrierId: CarrierId,
  name: z.string().min(1),
  serviceLocations: z.array(z.string().min(1)).min(1),
  qualifications: z.array(CarrierQualification),
})
export type Carrier = z.infer<typeof Carrier>

export const Vehicle = z.object({
  vehicleId: VehicleId,
  carrierId: CarrierId,
  maxPayloadGrams: positiveInteger,
  cargoLengthMm: positiveInteger,
  cargoWidthMm: positiveInteger,
  cargoHeightMm: positiveInteger,
  temperatureControl: TemperatureRange.optional(),
})
export type Vehicle = z.infer<typeof Vehicle>

export const Hub = z.object({
  hubId: z.string().min(1),
  location: z.string().min(1),
  supportsColdChain: z.boolean(),
  supportedCategories: z.array(CargoCategory).min(1),
})
export type Hub = z.infer<typeof Hub>

export const CustomerAccount = z.object({
  customerId: CustomerId,
  name: z.string().min(1),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  creditLimitCents: nonNegativeInteger,
  creditUsedCents: nonNegativeInteger,
  currency: z.string().length(3),
})
export type CustomerAccount = z.infer<typeof CustomerAccount>

export const Location = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
})
export type Location = z.infer<typeof Location>

export const ReferenceData = z.object({
  carriers: z.array(Carrier),
  vehicles: z.array(Vehicle),
  hubs: z.array(Hub),
  customers: z.array(CustomerAccount),
  locations: z.array(Location).optional(),
})
export type ReferenceData = z.infer<typeof ReferenceData>
