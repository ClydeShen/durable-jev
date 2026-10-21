import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { utcTimestampSchema } from '@durable-jev/contracts'
import { z } from 'zod'

const carrierSchema = z.object({
  carrierId: z.string().min(1),
  name: z.string().min(1),
  serviceRegions: z.array(z.string().min(1)),
  qualifications: z.array(z.string().min(1)),
  qualificationsValidUntil: utcTimestampSchema,
})

const vehicleSchema = z.object({
  vehicleId: z.string().min(1),
  carrierId: z.string().min(1),
  maxPayloadGrams: z.number().int().positive(),
  maxVolumeCubicCm: z.number().int().positive(),
  temperatureControlled: z.boolean(),
  minDeciCelsius: z.number().int().optional(),
  maxDeciCelsius: z.number().int().optional(),
})

const customerSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  creditLimitCents: z.number().int().nonnegative(),
  outstandingCents: z.number().int().nonnegative(),
  restrictionsText: z.string(),
})

const locationSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  hubId: z.string().min(1).optional(),
})

type Carrier = z.infer<typeof carrierSchema>
type Vehicle = z.infer<typeof vehicleSchema>
type Customer = z.infer<typeof customerSchema>
type Location = z.infer<typeof locationSchema>

export interface ReferenceData {
  carriers: ReadonlyMap<string, Carrier>
  vehicles: ReadonlyMap<string, Vehicle>
  customers: ReadonlyMap<string, Customer>
  locations: ReadonlyMap<string, Location>
}

function readList<T>(
  directory: string,
  file: string,
  schema: z.ZodType<T>,
  key: (item: T) => string,
) {
  const items = z.array(schema).parse(JSON.parse(readFileSync(join(directory, file), 'utf8')))
  return new Map(items.map((item) => [key(item), item]))
}

export function loadReferenceData(mockDataDirectory: string): ReferenceData {
  return {
    carriers: readList(mockDataDirectory, 'carriers.json', carrierSchema, (item) => item.carrierId),
    vehicles: readList(mockDataDirectory, 'vehicles.json', vehicleSchema, (item) => item.vehicleId),
    customers: readList(
      mockDataDirectory,
      'customers.json',
      customerSchema,
      (item) => item.customerId,
    ),
    locations: readList(mockDataDirectory, 'locations.json', locationSchema, (item) => item.name),
  }
}
