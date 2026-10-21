import type {
  CaseEvidence,
  CheckSubject,
  EntityVersions,
  GateStatus,
  HumanDecision,
  ReferenceData,
  SemanticAnswer,
  Shipment,
} from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import type { DecisionTables } from './decision-tables.rules.js'

export type PolicyParameters = Readonly<Record<string, number | string>>

export type { SemanticAnswer }

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
