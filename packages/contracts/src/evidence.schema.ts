import { z } from 'zod'
import { CargoItemId, UtcTimestamp } from './ids.schema.js'

export const DocumentKind = z.enum([
  'SAFETY_DATA_SHEET',
  'CONTROLLED_DECLARATION',
  'PACKING_LIST',
  'TRANSPORT_INSTRUCTIONS',
  'INSPECTION_CHECKLIST',
])
export type DocumentKind = z.infer<typeof DocumentKind>

export const CaseDocument = z.object({
  documentId: z.string().min(1),
  kind: DocumentKind,
  cargoItemId: CargoItemId.optional(),
  text: z.string(),
  extractedFields: z.record(z.string(), z.string()).default({}),
})
export type CaseDocument = z.infer<typeof CaseDocument>

export const TemperatureReading = z.object({
  at: UtcTimestamp,
  deciCelsius: z.int(),
})
export type TemperatureReading = z.infer<typeof TemperatureReading>

export const TemperatureLog = z.object({
  cargoItemId: CargoItemId,
  sensorId: z.string().min(1),
  calibrationValidUntil: UtcTimestamp,
  readings: z.array(TemperatureReading),
})
export type TemperatureLog = z.infer<typeof TemperatureLog>

export const InspectionNote = z.object({
  cargoItemId: CargoItemId,
  inspectedAt: UtcTimestamp,
  note: z.string(),
})
export type InspectionNote = z.infer<typeof InspectionNote>

export const CaseEvidence = z.object({
  documents: z.array(CaseDocument).default([]),
  temperatureLogs: z.array(TemperatureLog).default([]),
  inspectionNotes: z.array(InspectionNote).default([]),
})
export type CaseEvidence = z.infer<typeof CaseEvidence>

export const emptyCaseEvidence: CaseEvidence = {
  documents: [],
  temperatureLogs: [],
  inspectionNotes: [],
}
