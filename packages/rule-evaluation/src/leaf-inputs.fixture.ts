import { readFileSync } from 'node:fs'
import type {
  CargoItem,
  CaseEvidence,
  CheckSubject,
  ReferenceData,
  Shipment,
} from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import type { EvaluationInputs, SemanticAnswer } from './evaluation-inputs.js'
import { evaluateLeafRule } from './leaf-evaluators.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
export const readMaterial = (path: string) =>
  JSON.parse(readFileSync(new URL(path, materials), 'utf8'))

export const logOne = readMaterial('cases/LOG-001.json')
export const baseShipment: Shipment = logOne.shipment
export const referenceData: ReferenceData = readMaterial('mock-data/reference-data.json')
const policy = readMaterial('mock-policy-parameters.json')
const mixingMatrix = readMaterial('decision-tables/mixing-matrix.json')

export const order: CheckSubject = { scope: 'order', entityId: 'order' }
export const itemSubject = (entityId: string): CheckSubject => ({ scope: 'cargoItem', entityId })
export const legSubject = (entityId: string): CheckSubject => ({ scope: 'leg', entityId })

export function withItems(items: Partial<CargoItem>[]): Shipment {
  const [template] = baseShipment.cargoItems as [CargoItem]
  return {
    ...baseShipment,
    cargoItems: items.map((item, index) => ({
      ...template,
      cargoItemId: `ITEM-${index + 1}` as never,
      ...item,
    })),
  }
}

export function inputsFor(
  shipment: Shipment,
  overrides: Partial<EvaluationInputs> & {
    answers?: Record<string, SemanticAnswer>
    evidence?: Partial<CaseEvidence>
  } = {},
): EvaluationInputs {
  const { answers = {}, evidence = {}, ...rest } = overrides
  return {
    shipment,
    evidence: { documents: [], temperatureLogs: [], inspectionNotes: [], ...evidence },
    decisionTables: { mixingMatrix },
    storedVersions: {
      caseRevision: shipment.caseRevision,
      entityVersions: shipment.entityVersions,
    },
    referenceData,
    policy,
    semanticAnswerFor: (ruleId, entityId) => answers[`${ruleId}@${entityId}`],
    humanGateStatus: () => 'WAITING_HUMAN',
    humanDecisionFor: () => undefined,
    completedOperationFieldsFor: () => undefined,
    ensurePlanReservation: () => true,
    ...rest,
  }
}

export function evaluateWith(ref: string, subject: CheckSubject, inputs: EvaluationInputs) {
  const rule = { ruleId: ref, evaluator: { kind: 'code', ref } } as unknown as RuleDefinition
  return evaluateLeafRule(rule, subject, inputs)
}
