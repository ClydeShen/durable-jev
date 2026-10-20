import { readFileSync } from 'node:fs'
import type { CaseEvidence, Shipment } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { ScriptedJudge } from './scripted-judge.js'
import { buildSemanticQuestions, SemanticQuestionCatalog } from './semantic-question.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const catalog = SemanticQuestionCatalog.parse(readJson('semantic-questions.json'))
const logTwo = readJson('cases/LOG-002.json')
const logThree = readJson('cases/LOG-003.json')

const questionsFor = (
  caseFile: { shipment: Shipment; evidence: CaseEvidence },
  ruleIds: string[],
) =>
  buildSemanticQuestions({
    templates: catalog.questions,
    ruleIds: new Set(ruleIds),
    shipment: caseFile.shipment,
    evidence: caseFile.evidence,
  })

describe('buildSemanticQuestions', () => {
  it('builds one question per item with only the fields that question needs', () => {
    const [question] = questionsFor(logTwo, ['R18'])
    expect(question).toMatchObject({
      ruleId: 'R18',
      entityId: 'LOG-002-ITEM-1',
      kind: 'choice',
      state: { inspectionNote: expect.stringContaining('crushed') },
    })
    expect(Object.keys(question?.state ?? {})).toEqual(['inspectionNote'])
  })

  it('does not ask when the evidence a question needs is missing', () => {
    expect(questionsFor(logTwo, ['R10'])).toEqual([])
    expect(questionsFor(logThree, ['R10'])).toHaveLength(1)
  })

  it('summarises the route for order level questions', () => {
    const [question] = questionsFor(logTwo, ['R27'])
    expect(question?.state).toEqual({
      customerInstructions: expect.stringContaining('pharmacy'),
      routeSummary: 'SHA-WH1 to CAN-CLINIC by CAR-POLAR',
    })
  })
})

describe('ScriptedJudge', () => {
  it('replays the scripted answer for each question it has one for', async () => {
    const judge = new ScriptedJudge(logTwo.scriptedSemanticAnswers)
    const judgements = await judge.ask(questionsFor(logTwo, ['R03', 'R10', 'R18', 'R27']))
    expect(judgements.map((judgement) => judgement.ruleId).sort()).toEqual(['R03', 'R18', 'R27'])
    expect(judgements[0]).toMatchObject({ provider: 'scripted' })
  })
})
