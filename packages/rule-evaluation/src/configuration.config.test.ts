import { describe, expect, it } from 'vitest'
import { buildRuleConfiguration, InvalidRuleConfigurationError } from './configuration.config.js'
import { readMaterial } from './leaf-inputs.fixture.js'

describe('buildRuleConfiguration', () => {
  it('refuses a rule set whose semantic rule has no question template', () => {
    const catalog = readMaterial('semantic-questions.json')
    const withoutR27 = {
      ...catalog,
      questions: catalog.questions.filter(
        (question: { ruleId: string }) => question.ruleId !== 'R27',
      ),
    }
    expect(() =>
      buildRuleConfiguration(
        readMaterial('rules.json'),
        readMaterial('mock-policy-parameters.json'),
        {
          mixingMatrix: readMaterial('decision-tables/mixing-matrix.json'),
          semanticQuestions: withoutR27,
        },
      ),
    ).toThrow(InvalidRuleConfigurationError)
  })
})
