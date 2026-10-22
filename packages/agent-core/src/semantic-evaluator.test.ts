import { ScriptedJudge } from '@durable-jev/model-providers'
import type { CaseFacts, RuleDefinition } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { semanticEvaluator } from './semantic-evaluator.js'

const inspection: RuleDefinition = {
  ruleId: 'R18',
  version: '1',
  title: 'Inspection risk signal',
  owner: 'cargo-assurance',
  scope: 'cargoItem',
  dependsOn: [],
  evaluator: { kind: 'semantic', ref: 'R18' },
  semantic: {
    promptVersion: 'r18-v1',
    question: {
      kind: 'choice',
      text: 'Which risk signal does the inspection note show?',
      options: { no_risk: 'None', damaged_packaging: 'Damage', cold_chain_risk: 'Temperature' },
    },
    state: { note: 'item.inspectionNote' },
    passWhen: { choiceIn: ['no_risk'] },
  },
  unknownPolicy: 'block',
  inputPaths: [],
  parameters: [],
  invalidationTriggers: ['cargo'],
}

const facts: CaseFacts = {
  entityVersions: {},
  order: {},
  cargoItems: [{ cargoItemId: 'ITEM-1', facts: { inspectionNote: 'Outer carton crushed' } }],
  legs: [],
}

describe('semanticEvaluator', () => {
  it('keeps the observed signal apart from the gate status', async () => {
    const judge = new ScriptedJudge([
      { questionId: 'R18', judgement: { kind: 'choice', choice: 'damaged_packaging' } },
    ])
    const evaluation = await semanticEvaluator(judge)({
      rule: inspection,
      scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' },
      facts,
      scopeFacts: facts.cargoItems[0]?.facts ?? {},
      parameters: {},
      inputFingerprint: 'fp',
      resultOf: () => undefined,
      holds: () => ({ status: 'PASS', blockedBy: [] }),
    })
    expect(evaluation).toEqual({ status: 'FAIL', observedValue: 'damaged_packaging' })
  })
})

describe('semanticEvaluator as a classifier', () => {
  it('selects every label at or above the threshold, most likely first', async () => {
    const classifier: RuleDefinition = {
      ...inspection,
      ruleId: 'R42',
      evaluator: { kind: 'semantic', ref: 'R42' },
      semantic: {
        promptVersion: 'r42-v1',
        question: {
          kind: 'choice',
          text: 'Which commodity group describes this cargo item?',
          options: { pharmaceutical: 'Medicines', chemical: 'Chemicals', general: 'Other' },
        },
        state: { note: 'item.inspectionNote' },
        passWhen: { selectChoicesAtLeast: 0.25 },
      },
    }
    const judge = new ScriptedJudge([
      {
        questionId: 'R42',
        judgement: {
          kind: 'choice',
          choice: 'pharmaceutical',
          probabilities: { pharmaceutical: 0.62, chemical: 0.31, general: 0.07 },
        },
      },
    ])
    const evaluation = await semanticEvaluator(judge)({
      rule: classifier,
      scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' },
      facts,
      scopeFacts: facts.cargoItems[0]?.facts ?? {},
      parameters: {},
      inputFingerprint: 'fp',
      resultOf: () => undefined,
      holds: () => ({ status: 'PASS', blockedBy: [] }),
    })
    expect(evaluation).toEqual({ status: 'PASS', observedValue: ['pharmaceutical', 'chemical'] })
  })
})
