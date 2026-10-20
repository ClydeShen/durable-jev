import type { BranchEvaluationRequest } from '@durable-jev/contracts'
import type { SemanticJudge } from '@durable-jev/model-providers'
import { describe, expect, it } from 'vitest'
import { buildRuleConfiguration } from './configuration.js'
import { evaluateBranchWithJudge } from './evaluate-with-judge.js'
import { readMaterial, referenceData } from './leaf-inputs.fixture.js'

const configuration = buildRuleConfiguration(
  readMaterial('rules.json'),
  readMaterial('mock-policy-parameters.json'),
  {
    mixingMatrix: readMaterial('decision-tables/mixing-matrix.json'),
    semanticQuestions: readMaterial('semantic-questions.json'),
  },
)
const logTwo = readMaterial('cases/LOG-002.json')

const request = (): BranchEvaluationRequest => ({
  caseId: logTwo.caseId,
  caseRevision: 1,
  shipment: logTwo.shipment,
  evidence: logTwo.evidence,
  semanticAnswers: logTwo.scriptedSemanticAnswers,
  upstreamResults: [],
  humanGates: [],
})

describe('evaluateBranchWithJudge', () => {
  it('asks the judge only the questions of its own semantic rules and records who answered', async () => {
    const asked: string[] = []
    const judge: SemanticJudge = {
      provider: 'jev',
      modelId: 'jev-1.14.0',
      ask: async (questions) => {
        asked.push(...questions.map((question) => question.ruleId))
        return questions.map((question) => ({
          ruleId: question.ruleId,
          entityId: question.entityId,
          answer: { type: 'noul', noul: 0.97 },
          provider: 'jev',
          modelId: 'jev-1.14.0',
        }))
      },
    }
    const result = await evaluateBranchWithJudge(request(), {
      configuration,
      referenceData,
      branches: ['base'],
      judgeFor: () => judge,
    })
    expect(asked).toEqual(['R03'])
    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R03')).toMatchObject({
      gateStatus: 'PASS',
      observedValue: { matchesDescription: 0.97, provider: 'jev', modelId: 'jev-1.14.0' },
    })
  })

  it('replays scripted answers by default', async () => {
    const result = await evaluateBranchWithJudge(request(), {
      configuration,
      referenceData,
      branches: ['base'],
    })
    expect(
      result.evaluations.find((evaluation) => evaluation.ruleId === 'R03')?.observedValue,
    ).toMatchObject({
      provider: 'scripted',
    })
  })
})
