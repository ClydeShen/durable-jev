import type {
  CaseEvidence,
  CheckSubject,
  EntityVersions,
  GateStatus,
  HumanDecision,
  ReferenceData,
  Shipment,
} from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import type { DecisionTables } from './decision-tables.js'

export type PolicyParameters = Readonly<Record<string, number | string>>

export type SemanticAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number> }

export type EvaluationInputs = {
  shipment: Shipment
  evidence: CaseEvidence
  decisionTables: DecisionTables
  storedVersions: { caseRevision: number; entityVersions: EntityVersions }
  referenceData: ReferenceData
  policy: PolicyParameters
  semanticAnswerFor(ruleId: string, entityId: string): SemanticAnswer | undefined
  humanGateStatus(rule: RuleDefinition, subject: CheckSubject): GateStatus
  humanDecisionFor(ruleId: string, entityId: string): HumanDecision | undefined
  completedOperationFieldsFor(ruleId: string, entityId: string): Record<string, string> | undefined
  ensurePlanReservation(): boolean
}
