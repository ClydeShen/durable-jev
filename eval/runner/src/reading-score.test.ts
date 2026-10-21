import { describe, expect, it } from 'vitest'
import { decide, type Reading, scoreReadings, type Thresholds } from './reading-score.helpers.js'

const noul = (value: number) => ({ type: 'noul', noul: value }) as const
const thresholds: Thresholds = {
  passAtLeast: 0.8,
  failAtMost: 0.2,
  choiceMinProbability: 0.6,
  reviewBand: 0.05,
}

describe('reading scores', () => {
  it('reads answers the way the rules do', () => {
    expect(decide(noul(0.97), thresholds)).toBe('PASS')
    expect(decide(noul(0.81), thresholds)).toBe('PERSON')
    expect(decide(noul(0.1), thresholds)).toBe('FAIL')
    expect(decide(noul(0.2), thresholds)).toBe('PERSON')
    expect(
      decide({ type: 'choice', choice: 'no_risk', probabilities: { no_risk: 0.9 } }, thresholds),
    ).toBe('CHOICE:no_risk')
  })

  it('counts automation, wrong automation and unstable questions', () => {
    const items: Reading[] = [
      {
        caseId: 'a',
        ruleId: 'R03',
        entityId: 'x',
        expected: noul(0.96),
        readings: [noul(0.97), noul(0.96)],
      },
      {
        caseId: 'a',
        ruleId: 'R03',
        entityId: 'y',
        expected: noul(0.96),
        readings: [noul(0.76), noul(0.81)],
      },
      {
        caseId: 'b',
        ruleId: 'R10',
        entityId: 'z',
        expected: noul(0.5),
        readings: [noul(0.5), noul(0.9)],
      },
    ]
    const withBand = scoreReadings(items, thresholds)
    expect(withBand).toMatchObject({
      readings: 6,
      automated: 3,
      automatedCorrect: 2,
      automatedWrong: 1,
      sentToPerson: 2,
      personExpected: 1,
    })
    const withoutBand = scoreReadings(items, { ...thresholds, reviewBand: 0 })
    expect(withoutBand.automated).toBe(4)
    expect(withoutBand.unstableQuestions).toBe(2)
    expect(withBand.unstableQuestions).toBe(1)
  })
})
