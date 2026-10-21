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

  it('fails instead of guessing when nothing is scripted', async () => {
    await expect(judge.ask(documentMatchQuestion, inspectionState)).rejects.toBeInstanceOf(
      SemanticJudgeError,
    )
  })
})
