import type {
  CheckSubject,
  EntityVersions,
  GateStatus,
  ReferenceData,
  Shipment,
} from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'

export type PolicyParameters = Readonly<Record<string, number | string>>

export type SemanticAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number> }

export type EvaluationInputs = {
  shipment: Shipment
  storedVersions: { caseRevision: number; entityVersions: EntityVersions }
  referenceData: ReferenceData
  policy: PolicyParameters
  semanticAnswerFor(ruleId: string, entityId: string): SemanticAnswer | undefined
  humanGateStatus(rule: RuleDefinition, subject: CheckSubject): GateStatus
  preloadHumanTasksStatus(): GateStatus
  ensurePlanReservation(): boolean
}
