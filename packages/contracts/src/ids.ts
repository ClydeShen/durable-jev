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
export const ruleIdSchema = z.string().regex(/^(R\d{2}|[A-Z]+(-[A-Z0-9]+)+)$/)
export const humanTaskIdSchema = identifier
export const evidenceRefSchema = identifier

export const revisionSchema = z.number().int().positive()
export const utcTimestampSchema = z.iso.datetime({ offset: false })

export type RuleId = z.infer<typeof ruleIdSchema>
