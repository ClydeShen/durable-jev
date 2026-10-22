import type { RuleDefinition, RuleSet } from '@durable-jev/rule-engine'
import { createModels } from '@earendil-works/pi-ai'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { describe, expect, it } from 'vitest'
import { type AuthoringModel, authorRules } from './author-rules.js'

const existing: RuleDefinition = {
  ruleId: 'R01',
  version: '1',
  title: 'Order complete',
  owner: 'order-coordination',
  scope: 'order',
  dependsOn: [],
  evaluator: { kind: 'expression', ref: 'R01' },
  expression: { passWhen: 'count(cargoItems) > 0' },
  unknownPolicy: 'block',
  inputPaths: [],
  parameters: [],
  invalidationTriggers: ['cargo'],
}

const weightRule = (passWhen: string): RuleDefinition => ({
  ...existing,
  ruleId: 'R02',
  title: 'Weight within limit',
  scope: 'cargoItem',
  dependsOn: ['R01'],
  evaluator: { kind: 'expression', ref: 'R02' },
  expression: { passWhen },
  parameters: ['maxItemWeightGrams'],
})

const ruleSet: RuleSet = { ruleSetVersion: 'test', rules: [existing], mixingMatrix: [] }

function scripted(...attempts: RuleDefinition[][]): AuthoringModel {
  const faux = fauxProvider({ provider: 'scripted-authoring', models: [{ id: 'recorded' }] })
  faux.setResponses(
    attempts.map((rules) =>
      fauxAssistantMessage(
        fauxToolCall('submit_rules', { rules: JSON.parse(JSON.stringify(rules)) }),
        {
          stopReason: 'toolUse',
        },
      ),
    ),
  )
  const models = createModels()
  models.setProvider(faux.provider)
  return { models, provider: 'scripted-authoring', modelId: 'recorded' }
}

const request = {
  section: {
    title: 'Part X. Weights',
    text: '**R02 Weight within limit.** (cargo item) Each item weighs at most maxItemWeightGrams.',
  },
  ruleSet,
  parameters: { maxItemWeightGrams: 500_000 },
  factsCatalog: 'item.weightGrams is the weight of the line',
  codeEvaluatorRefs: new Set<string>(),
}

describe('authorRules', () => {
  it('sends validation issues back to the model until the rules are valid', async () => {
    const result = await authorRules(
      request,
      scripted(
        [weightRule('item.weightGrams <= params.maxWeightGrams')],
        [weightRule('item.weightGrams <= params.maxItemWeightGrams')],
      ),
    )
    expect(result.accepted).toBe(true)
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]?.issues.join()).toContain('UNDECLARED_PARAMETER')
    expect(result.rules.map((rule) => rule.ruleId)).toEqual(['R02'])
  })

  it('rejects the proposal when the model never gets it right', async () => {
    const wrong = weightRule('item.weightGrams <= ')
    const result = await authorRules(request, scripted([wrong], [wrong], [wrong]))
    expect(result.accepted).toBe(false)
    expect(result.attempts.every((attempt) => attempt.issues.length > 0)).toBe(true)
  })
})
