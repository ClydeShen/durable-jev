import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { CachingJudge, semanticCacheMigrations } from './caching-judge.js'
import type { SemanticJudge } from './semantic-judge.js'
import type { SemanticQuestion } from './semantic-question.js'

function countingJudge() {
  const asked: string[] = []
  const judge: SemanticJudge = {
    provider: 'jev',
    modelId: 'jev-1.14.0',
    ask: async (questions) => {
      asked.push(...questions.map((question) => `${question.ruleId}@${question.entityId}`))
      return questions.map((question) => ({
        ruleId: question.ruleId,
        entityId: question.entityId,
        answer: { type: 'noul', noul: 0.9 },
        provider: 'jev',
        modelId: 'jev-1.14.0',
      }))
    },
  }
  return { judge, asked }
}

const question = (entityId: string, description: string): SemanticQuestion => ({
  ruleId: 'R03',
  entityId,
  kind: 'noul',
  prompt: 'Matches?',
  state: { description },
})

describe('CachingJudge', () => {
  it('asks the model once for the same question and state', async () => {
    const { judge, asked } = countingJudge()
    const caching = new CachingJudge(judge, openDatabase(':memory:', semanticCacheMigrations))
    await caching.ask([question('ITEM-1', 'kettles')])
    const again = await caching.ask([question('ITEM-1', 'kettles')])
    expect(asked).toEqual(['R03@ITEM-1'])
    expect(again).toMatchObject([{ ruleId: 'R03', entityId: 'ITEM-1', answer: { noul: 0.9 } }])
  })

  it('asks again when the state changes', async () => {
    const { judge, asked } = countingJudge()
    const caching = new CachingJudge(judge, openDatabase(':memory:', semanticCacheMigrations))
    await caching.ask([question('ITEM-1', 'kettles')])
    await caching.ask([question('ITEM-1', 'towels')])
    expect(asked).toEqual(['R03@ITEM-1', 'R03@ITEM-1'])
  })

  it('reuses an identical question asked for another item', async () => {
    const { judge, asked } = countingJudge()
    const caching = new CachingJudge(judge, openDatabase(':memory:', semanticCacheMigrations))
    await caching.ask([question('ITEM-1', 'kettles')])
    const [judgement] = await caching.ask([question('ITEM-2', 'kettles')])
    expect(asked).toEqual(['R03@ITEM-1'])
    expect(judgement?.entityId).toBe('ITEM-2')
  })
})
