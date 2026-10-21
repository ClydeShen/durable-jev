import { z } from 'zod'

const identifier = z.string().min(1)

export const caseIdSchema = identifier
export const correlationIdSchema = identifier
export const shipmentIdSchema = identifier
export const customerIdSchema = identifier
export const cargoItemIdSchema = identifier
export const legIdSchema = identifier
export const carrierIdSchema = identifier
export const vehicleIdSchema = identifier
export const hubIdSchema = identifier
export const documentIdSchema = identifier
export const ruleIdSchema = z.string().regex(/^R\d{2}$/)
export const checkIdSchema = identifier
export const humanTaskIdSchema = identifier
export const operationIdSchema = identifier
export const evidenceRefSchema = identifier

export const revisionSchema = z.number().int().positive()
export const utcTimestampSchema = z.iso.datetime({ offset: false })

export type CaseId = z.infer<typeof caseIdSchema>
export type RuleId = z.infer<typeof ruleIdSchema>
export type Revision = z.infer<typeof revisionSchema>
export type UtcTimestamp = z.infer<typeof utcTimestampSchema>
