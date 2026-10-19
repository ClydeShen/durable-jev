import { z } from 'zod'

const identifier = z.string().min(1)

export const CaseId = identifier.brand<'CaseId'>()
export const ShipmentId = identifier.brand<'ShipmentId'>()
export const CustomerId = identifier.brand<'CustomerId'>()
export const CargoItemId = identifier.brand<'CargoItemId'>()
export const LegId = identifier.brand<'LegId'>()
export const CarrierId = identifier.brand<'CarrierId'>()
export const VehicleId = identifier.brand<'VehicleId'>()
export const RuleId = identifier.brand<'RuleId'>()
export const CheckResultId = identifier.brand<'CheckResultId'>()
export const HumanTaskId = identifier.brand<'HumanTaskId'>()
export const OperationId = identifier.brand<'OperationId'>()
export const CorrelationId = identifier.brand<'CorrelationId'>()
export const EvidenceRef = identifier.brand<'EvidenceRef'>()

export type CaseId = z.infer<typeof CaseId>
export type ShipmentId = z.infer<typeof ShipmentId>
export type CustomerId = z.infer<typeof CustomerId>
export type CargoItemId = z.infer<typeof CargoItemId>
export type LegId = z.infer<typeof LegId>
export type CarrierId = z.infer<typeof CarrierId>
export type VehicleId = z.infer<typeof VehicleId>
export type RuleId = z.infer<typeof RuleId>
export type CheckResultId = z.infer<typeof CheckResultId>
export type HumanTaskId = z.infer<typeof HumanTaskId>
export type OperationId = z.infer<typeof OperationId>
export type CorrelationId = z.infer<typeof CorrelationId>
export type EvidenceRef = z.infer<typeof EvidenceRef>

export const UtcTimestamp = z.iso.datetime()
export type UtcTimestamp = z.infer<typeof UtcTimestamp>
