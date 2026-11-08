import {
  JevJudge,
  ScriptedJudge,
  type SemanticJudge,
  type SemanticJudgement,
} from '@durable-jev/model-providers'
import { type CaseFacts, evaluateRuleGraph, type RuleDefinition } from '@durable-jev/rule-engine'
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
  root: { scope: { kind: 'order' }, facts: {} },
  context: {},
  collections: {
    cargoItem: [
      {
        scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' },
        facts: { inspectionNote: 'Outer carton crushed' },
        context: { item: { inspectionNote: 'Outer carton crushed' } },
      },
    ],
  },
}

async function evaluateWith(rule: RuleDefinition, judge: SemanticJudge) {
  const graph = await evaluateRuleGraph(
    {
      ruleSetVersion: 'provider-contract',
      rootScope: 'order',
      mixingMatrix: [],
      rules: [rule],
    },
    facts,
    { parameters: {}, evaluators: new Map([[rule.ruleId, semanticEvaluator(judge)]]) },
  )
  return graph.outcomes.map(({ status, observedValue }) => ({ status, observedValue }))
}

describe('provider substitution through the same rule graph (offline)', () => {
  const cases: {
    name: string
    judgement: SemanticJudgement
    mode: 'choice' | 'noul' | 'distribution'
    status: string
    observed: string | number | string[]
  }[] = [
    {
      name: 'single-label decision',
      mode: 'choice',
      judgement: {
        kind: 'choice',
        choice: 'damaged_packaging',
        probabilities: { damaged_packaging: 0.9, no_risk: 0.1, cold_chain_risk: 0 },
      },
      status: 'FAIL',
      observed: 'damaged_packaging',
    },
    {
      name: 'probability above threshold',
      mode: 'noul',
      judgement: { kind: 'noul', probability: 0.9 },
      status: 'PASS',
      observed: 0.9,
    },
    {
      name: 'probability below threshold',
      mode: 'noul',
      judgement: { kind: 'noul', probability: 0.2 },
      status: 'FAIL',
      observed: 0.2,
    },
    {
      name: 'multi-label probability selection',
      mode: 'distribution',
      judgement: {
        kind: 'choice',
        choice: 'damaged_packaging',
        probabilities: { damaged_packaging: 0.6, cold_chain_risk: 0.3, no_risk: 0.1 },
      },
      status: 'PASS',
      observed: ['damaged_packaging', 'cold_chain_risk'],
    },
  ]
  it.each(cases)(
    'preserves $name when the provider is replaced',
    async ({ mode, judgement, status, observed }) => {
      const rule: RuleDefinition = {
        ...inspection,
        semantic: {
          promptVersion: 'provider-contract',
          state: { note: 'item.inspectionNote' },
          question:
            mode === 'noul'
              ? { kind: 'noul', text: 'The packaging is intact.' }
              : {
                  kind: 'choice',
                  text: 'Which risk signals are present?',
                  options: {
                    damaged_packaging: 'Damage',
                    cold_chain_risk: 'Temperature',
                    no_risk: 'None',
                  },
                },
          passWhen: {
            noul: { probabilityAtLeast: 0.8 },
            distribution: { selectChoicesAtLeast: 0.25 },
            choice: { choiceIn: ['no_risk'] },
          }[mode],
        },
      }
      const requests: unknown[] = []
      const jev = new JevJudge({
        apiKey: 'offline-test',
        fetch: async (_url, init) => {
          requests.push(JSON.parse(String(init?.body)))
          const answer =
            judgement.kind === 'noul'
              ? { type: 'noul', noul: judgement.probability }
              : {
                  type: 'choice',
                  choice: judgement.choice,
                  probabilities: judgement.probabilities,
                  confidence: 0.9,
                }
          return new Response(
            JSON.stringify({
              model: 'jev-1.14.0',
              answers: { answer },
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        },
      })
      const scripted = new ScriptedJudge([{ questionId: rule.ruleId, judgement }])
      const expected = [{ status, observedValue: observed }]
      expect(await evaluateWith(rule, scripted)).toEqual(expected)
      expect(await evaluateWith(rule, jev)).toEqual(expected)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ state: { note: 'Outer carton crushed' } })
    },
  )

  it('turns a rejected provider request into ERROR without retrying or passing the gate', async () => {
    let requests = 0
    const judge = new JevJudge({
      apiKey: 'offline-test',
      fetch: async () => {
        requests++
        return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    expect(await evaluateWith(inspection, judge)).toMatchObject([{ status: 'ERROR' }])
    expect(requests).toBe(1)
  })

  it('refuses an out-of-range probability from a provider rather than passing the gate', async () => {
    const rule: RuleDefinition = {
      ...inspection,
      semantic: {
        promptVersion: 'invalid-output',
        question: { kind: 'noul', text: 'The packaging is intact.' },
        state: {},
        passWhen: { probabilityAtLeast: 0.8 },
      },
    }
    const judge = new JevJudge({
      apiKey: 'offline-test',
      fetch: async () =>
        new Response(
          JSON.stringify({
            model: 'jev-1.14.0',
            answers: { answer: { type: 'noul', noul: 2 } },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    })
    expect(await evaluateWith(rule, judge)).toMatchObject([{ status: 'ERROR' }])
  })

  it.each<SemanticJudgement>([
    { kind: 'choice', choice: 'invented_label' },
    { kind: 'choice', choice: 'no_risk', confidence: 2 },
    { kind: 'choice', choice: 'no_risk', probabilities: { no_risk: -0.1 } },
    { kind: 'choice', choice: 'no_risk', probabilities: { invented_label: 0.8 } },
    { kind: 'choice', choice: 'no_risk', confidence: Number.NaN },
    { kind: 'noul', probability: 0.9 },
  ])(
    'rejects invalid or incompatible judgement %j independently of the provider',
    async (judgement) => {
      const judge = new ScriptedJudge([{ questionId: inspection.ruleId, judgement }])
      expect(await evaluateWith(inspection, judge)).toMatchObject([{ status: 'ERROR' }])
    },
  )
})

describe('semanticEvaluator', () => {
  it('keeps the observed signal apart from the gate status', async () => {
    const judge = new ScriptedJudge([
      { questionId: 'R18', judgement: { kind: 'choice', choice: 'damaged_packaging' } },
    ])
    const evaluation = await semanticEvaluator(judge)({
      rule: inspection,
      scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' },
      facts,
      scopeFacts: facts.collections.cargoItem?.[0]?.facts ?? {},
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
      scopeFacts: facts.collections.cargoItem?.[0]?.facts ?? {},
      parameters: {},
      inputFingerprint: 'fp',
      resultOf: () => undefined,
      holds: () => ({ status: 'PASS', blockedBy: [] }),
    })
    expect(evaluation).toEqual({ status: 'PASS', observedValue: ['pharmaceutical', 'chemical'] })
  })
})
