import { describe, expect, it } from 'vitest'
import { documentMatchQuestion, inspectionState, packagingRiskQuestion } from './fixtures.js'
import { semanticInputHash } from './input-hash.js'
import { ScriptedJudge } from './scripted-judge.js'
import { SemanticJudgeError } from './semantic-judge.js'

describe('ScriptedJudge', () => {
  const exactHash = semanticInputHash(packagingRiskQuestion, inspectionState)
  const judge = new ScriptedJudge([
    {
      questionId: packagingRiskQuestion.questionId,
      judgement: { kind: 'choice', choice: 'no_risk' },
    },
    {
      questionId: packagingRiskQuestion.questionId,
      inputHash: exactHash,
      judgement: { kind: 'choice', choice: 'damaged_packaging' },
    },
  ])

  it('replays the entry recorded for the exact input before the question default', async () => {
    const answer = await judge.ask(packagingRiskQuestion, inspectionState)
    expect(answer.judgement).toEqual({ kind: 'choice', choice: 'damaged_packaging' })
    expect(answer.inputHash).toBe(exactHash)
    expect(answer.usage).toBe('unknown')
    const other = await judge.ask(packagingRiskQuestion, { inspectionNote: 'All good' })
    expect(other.judgement).toEqual({ kind: 'choice', choice: 'no_risk' })
  })

  it('matches an entry by text contained in the state', async () => {
    const byText = new ScriptedJudge([
      {
        questionId: documentMatchQuestion.questionId,
        judgement: { kind: 'noul', probability: 0.1 },
      },
      {
        questionId: documentMatchQuestion.questionId,
        stateIncludes: 'corrected',
        judgement: { kind: 'noul', probability: 0.95 },
      },
    ])
    const corrected = await byText.ask(documentMatchQuestion, {
      sheet: 'corrected safety data sheet',
    })
    expect(corrected.judgement).toEqual({ kind: 'noul', probability: 0.95 })
    const original = await byText.ask(documentMatchQuestion, { sheet: 'original sheet' })
    expect(original.judgement).toEqual({ kind: 'noul', probability: 0.1 })
  })

  it('fails instead of guessing when nothing is scripted', async () => {
    await expect(judge.ask(documentMatchQuestion, inspectionState)).rejects.toBeInstanceOf(
      SemanticJudgeError,
    )
  })
})
