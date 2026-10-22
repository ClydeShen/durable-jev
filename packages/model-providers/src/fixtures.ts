import type { ChoiceQuestion, NoulQuestion, SemanticState } from './semantic-judge.js'

export const packagingRiskQuestion: ChoiceQuestion = {
  kind: 'choice',
  questionId: 'R18.packagingRisk',
  promptVersion: 'v1',
  text: 'Which risk signal does the inspection note show?',
  options: {
    no_risk: 'No packaging damage or temperature risk is described',
    damaged_packaging: 'Physical damage to packaging is described',
    cold_chain_risk: 'Temperature control appears compromised without physical damage',
  },
}

export const documentMatchQuestion: NoulQuestion = {
  kind: 'noul',
  questionId: 'R10.documentMatchesDeclaration',
  promptVersion: 'v1',
  text: 'The safety data sheet describes the same goods as the declared cargo',
}

export const inspectionState: SemanticState = {
  inspectionNote: 'Outer carton crushed on one corner, condensation inside, ice packs intact.',
  declaredCargo: 'Vaccines, 2-8C, 40 vials',
  safetyDataSheetSummary: 'Lithium batteries, UN3480',
}
