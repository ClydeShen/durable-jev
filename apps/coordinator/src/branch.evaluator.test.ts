import { readFileSync } from 'node:fs'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators, planEvaluationLayers } from './branch-evaluators.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const configuration = buildRuleConfiguration(
  readJson('rules.json'),
  readJson('mock-policy-parameters.json'),
  {
    mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
    semanticQuestions: readJson('semantic-questions.json'),
  },
)
const referenceData = readJson('mock-data/reference-data.json')

describe('planEvaluationLayers', () => {
  const evaluators = inProcessEvaluators(configuration, referenceData)
  const names = (layers: { name: string; branches: readonly string[] }[][]) =>
    layers.map((layer) => layer.map((evaluator) => evaluator.branches.join('+')))

  it('runs independent branches side by side and dependent ones after their inputs', () => {
    expect(names(planEvaluationLayers(evaluators, configuration))).toEqual([
      ['base', 'commercial'],
      ['controlled+coldChain'],
      ['plan'],
      ['release'],
    ])
  })

  it('does not depend on the order evaluators are listed in', () => {
    const reversed = [...evaluators].reverse()
    expect(names(planEvaluationLayers(reversed, configuration))).toEqual([
      ['commercial', 'base'],
      ['controlled+coldChain'],
      ['plan'],
      ['release'],
    ])
  })

  it('rejects a set of evaluators that leaves a branch uncovered', () => {
    const withoutCommercial = evaluators.filter(
      (evaluator) => !evaluator.branches.includes('commercial'),
    )
    expect(() => planEvaluationLayers(withoutCommercial, configuration)).toThrow(
      /no evaluator covers/,
    )
  })

  it('rejects two evaluators for the same branch', () => {
    const [base] = evaluators
    expect(() => planEvaluationLayers([...evaluators, base] as never, configuration)).toThrow(
      /both evaluate/,
    )
  })
})
