import { readFileSync } from 'node:fs'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { describe, expect, it } from 'vitest'
import { assertEvaluationOrder, inProcessEvaluators } from './branch-evaluators.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const configuration = buildRuleConfiguration(
  readJson('rules.json'),
  readJson('mock-policy-parameters.json'),
  {
    mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
  },
)
const referenceData = readJson('mock-data/reference-data.json')

describe('assertEvaluationOrder', () => {
  it('accepts base, cargo, plan, commercial, then release', () => {
    expect(() =>
      assertEvaluationOrder(inProcessEvaluators(configuration, referenceData), configuration),
    ).not.toThrow()
  })

  it('rejects planning before cargo assurance because R29 needs R11', () => {
    const [base, cargo, plan, commercial, release] = inProcessEvaluators(
      configuration,
      referenceData,
    )
    expect(() =>
      assertEvaluationOrder([base, plan, cargo, commercial, release] as never, configuration),
    ).toThrow(/transport-planning needs .*R11/)
  })

  it('rejects a set of evaluators that leaves a branch uncovered', () => {
    const [base, cargo, plan, , release] = inProcessEvaluators(configuration, referenceData)
    expect(() =>
      assertEvaluationOrder([base, cargo, plan, release] as never, configuration),
    ).toThrow(/needs .*R3[1-6]|no evaluator covers/)
  })
})
