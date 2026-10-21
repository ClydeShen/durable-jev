import { z } from 'zod'
import {
  cargoItemIdSchema,
  carrierIdSchema,
  caseIdSchema,
  correlationIdSchema,
  customerIdSchema,
  documentIdSchema,
  hubIdSchema,
  legIdSchema,
  revisionSchema,
  shipmentIdSchema,
  utcTimestampSchema,
  vehicleIdSchema,
} from './ids.js'

const positiveInteger = z.number().int().positive()

export const cargoCategorySchema = z.enum(['general', 'coldChain', 'controlled'])
export type CargoCategory = z.infer<typeof cargoCategorySchema>

const temperatureRangeSchema = z
  .object({ minDeciCelsius: z.number().int(), maxDeciCelsius: z.number().int() })
  .refine((range) => range.minDeciCelsius <= range.maxDeciCelsius, 'min must not exceed max')

const timeWindowSchema = z
  .object({ from: utcTimestampSchema, to: utcTimestampSchema })
  .refine((window) => window.from <= window.to, 'from must not be after to')

const cargoItemSchema = z.object({
  cargoItemId: cargoItemIdSchema,
  description: z.string(),
  declaredCategories: z.array(cargoCategorySchema).min(1),
  controlledClass: z.string().optional(),
  quantity: positiveInteger,
  weightGrams: positiveInteger,
  dimensionsMillimetres: z.object({
    length: positiveInteger,
    width: positiveInteger,
    height: positiveInteger,
  }),
  temperatureRange: temperatureRangeSchema.optional(),
})
export type CargoItem = z.infer<typeof cargoItemSchema>

const legSchema = z.object({
  legId: legIdSchema,
  sequence: positiveInteger,
  origin: z.string().min(1),
  destination: z.string().min(1),
  transferHubId: hubIdSchema.optional(),
  carrierId: carrierIdSchema,
  vehicleId: vehicleIdSchema,
  plannedDeparture: utcTimestampSchema,
  plannedArrival: utcTimestampSchema,
})
export type Leg = z.infer<typeof legSchema>

const quoteSchema = z.object({
  amountCents: z.number().int().nonnegative(),
  extraCostCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
})

const documentKindSchema = z.enum([
  'transportInstructions',
  'packingList',
  'safetyDataSheet',
  'inspectionChecklist',
  'temperatureLog',
  'customerRestrictions',
])

const caseDocumentSchema = z.object({
  documentId: documentIdSchema,
  kind: documentKindSchema,
  cargoItemId: cargoItemIdSchema.optional(),
  version: revisionSchema,
  text: z.string(),
  extractedFields: z.record(z.string(), z.unknown()),
  source: z.string().min(1),
})

export const entityVersionsSchema = z.object({
  cargo: revisionSchema,
  route: revisionSchema,
  carrier: revisionSchema,
  quote: revisionSchema,
})

export const shipmentSchema = z
  .object({
    caseId: caseIdSchema,
    correlationId: correlationIdSchema,
    shipmentId: shipmentIdSchema,
    customerId: customerIdSchema,
    caseRevision: revisionSchema,
    entityVersions: entityVersionsSchema,
    cargoItems: z.array(cargoItemSchema).min(1),
    legs: z.array(legSchema).min(1).max(3),
    deliveryWindow: timeWindowSchema,
    handover: z.enum(['dock', 'curbside', 'customerSite']),
    quote: quoteSchema,
    documents: z.array(caseDocumentSchema),
  })
  .refine(
    (shipment) => shipment.legs.every((leg, index) => leg.sequence === index + 1),
    'legs must be ordered by sequence starting at 1',
  )
export type Shipment = z.infer<typeof shipmentSchema>
