import type { BranchEvaluationRequest } from '@durable-jev/contracts'
import type { SemanticJudge } from '@durable-jev/model-providers'
import { openDatabase, readUnpublishedOutboxEvents } from '@durable-jev/store'
import { Telemetry } from '@durable-jev/telemetry'
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

  it('records each Jev question and answer as events without storing the case text', async () => {
    const database = openDatabase(':memory:')
    const judge: SemanticJudge = {
      provider: 'jev',
      modelId: 'jev-1.14.0',
      ask: async (questions) =>
        questions.map((question) => ({
          ruleId: question.ruleId,
          entityId: question.entityId,
          answer: { type: 'noul', noul: 0.91 },
          provider: 'jev',
          modelId: 'jev-1.14.0',
        })),
    }
    await evaluateBranchWithJudge(request(), {
      configuration,
      referenceData,
      branches: ['base'],
      judgeFor: () => judge,
      telemetry: new Telemetry('coordinator', database),
    })
    const events = readUnpublishedOutboxEvents(database).map(
      (row) => row.payload as { eventName: string; attributes: Record<string, unknown> },
    )
    const requested = events.filter((event) => event.eventName === 'jev.requested')
    const completed = events.filter((event) => event.eventName === 'jev.completed')
    expect(requested.length).toBeGreaterThan(0)
    expect(completed).toHaveLength(requested.length)
    expect(completed[0]?.attributes).toMatchObject({
      provider: 'jev',
      modelId: 'jev-1.14.0',
      answer: { type: 'noul', noul: 0.91 },
    })
    expect(requested[0]?.attributes.inputHash).toMatch(/^[0-9a-f]{16}$/)
    expect(JSON.stringify(events)).not.toContain('Influenza')
  })

  it('records a task.failed event when the judge is unavailable and passes the error on', async () => {
    const database = openDatabase(':memory:')
    const judge: SemanticJudge = {
      provider: 'jev',
      modelId: 'jev-1.14.0',
      ask: async () => {
        throw new Error('429 rate limited')
      },
    }
    await expect(
      evaluateBranchWithJudge(request(), {
        configuration,
        referenceData,
        branches: ['base'],
        judgeFor: () => judge,
        telemetry: new Telemetry('coordinator', database),
      }),
    ).rejects.toThrow('429')
    const failed = readUnpublishedOutboxEvents(database)
      .map((row) => row.payload as { eventName: string; errorCode?: string })
      .find((event) => event.eventName === 'task.failed')
    expect(failed?.errorCode).toBe('JUDGE_UNAVAILABLE')
  })
})
