import { createModels } from '@earendil-works/pi-ai'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { describe, expect, it } from 'vitest'
import { documentMatchQuestion, inspectionState, packagingRiskQuestion } from './fixtures.js'
import { SemanticJudgeError } from './semantic-judge.js'
import { StructuredOutputJudge } from './structured-output-judge.js'

function scriptedJudge(...responses: Parameters<typeof fauxAssistantMessage>[0][]) {
  const faux = fauxProvider({ provider: 'scripted-llm', models: [{ id: 'structured' }] })
  const models = createModels()
  models.setProvider(faux.provider)
  faux.setResponses(
    responses.map((content) => fauxAssistantMessage(content, { stopReason: 'toolUse' })),
  )
  return new StructuredOutputJudge({ models, provider: 'scripted-llm', model: 'structured' })
}

describe('StructuredOutputJudge', () => {
  it('reads a choice from the answer tool call', async () => {
    const judge = scriptedJudge(fauxToolCall('submit_answer', { choice: 'damaged_packaging' }))
    const answer = await judge.ask(packagingRiskQuestion, inspectionState)
    expect(answer.provider).toBe('structured-output')
    expect(answer.judgement).toEqual({ kind: 'choice', choice: 'damaged_packaging' })
  })

  it('reads a noul probability from the answer tool call', async () => {
    const judge = scriptedJudge(fauxToolCall('submit_answer', { probability: 0.1 }))
    const answer = await judge.ask(documentMatchQuestion, inspectionState)
    expect(answer.judgement).toEqual({ kind: 'noul', probability: 0.1 })
  })

  it('rejects labels outside the question', async () => {
    const judge = scriptedJudge(fauxToolCall('submit_answer', { choice: 'probably_fine' }))
    await expect(judge.ask(packagingRiskQuestion, inspectionState)).rejects.toBeInstanceOf(
      SemanticJudgeError,
    )
  })

  it('rejects a reply without the answer tool call', async () => {
    const judge = scriptedJudge(fauxText('It looks damaged.'))
    await expect(judge.ask(packagingRiskQuestion, inspectionState)).rejects.toBeInstanceOf(
      SemanticJudgeError,
    )
  })
})
