import type { SemanticAnswer } from '@durable-jev/contracts'

export type Decision = 'PASS' | 'FAIL' | 'PERSON' | `CHOICE:${string}`

export type Thresholds = {
  passAtLeast: number
  failAtMost: number
  choiceMinProbability: number
  reviewBand: number
}

const tolerance = 1e-9

// The same reading of an answer as the rules use, so the score matches what the system does.
export const decide = (answer: SemanticAnswer, thresholds: Thresholds): Decision => {
  if (answer.type === 'noul') {
    if (answer.noul + tolerance >= thresholds.passAtLeast + thresholds.reviewBand) return 'PASS'
    if (answer.noul - tolerance <= thresholds.failAtMost - thresholds.reviewBand) return 'FAIL'
    return 'PERSON'
  }
  const probability = answer.probabilities[answer.choice] ?? 0
  return probability >= thresholds.choiceMinProbability ? `CHOICE:${answer.choice}` : 'PERSON'
}

export type Reading = {
  caseId: string
  ruleId: string
  entityId: string
  expected: SemanticAnswer
  readings: SemanticAnswer[]
}

export type Score = {
  questions: number
  readings: number
  // Answered without a person.
  automated: number
  // Automated and equal to what the reviewer expects.
  automatedCorrect: number
  // Automated but different from what the reviewer expects.
  automatedWrong: number
  // A person is asked although the expected answer was clear.
  sentToPerson: number
  // The expected answer itself needs a person, and a person is asked.
  personExpected: number
  // A question whose runs did not all decide the same way.
  unstableQuestions: number
}

// What the reviewer expects, read with the plain thresholds (no band): the labels are clean.
export const scoreReadings = (items: Reading[], thresholds: Thresholds): Score => {
  const plain = { ...thresholds, reviewBand: 0 }
  const score: Score = {
    questions: items.length,
    readings: 0,
    automated: 0,
    automatedCorrect: 0,
    automatedWrong: 0,
    sentToPerson: 0,
    personExpected: 0,
    unstableQuestions: 0,
  }
  for (const item of items) {
    const expected = decide(item.expected, plain)
    const decisions = item.readings.map((reading) => decide(reading, thresholds))
    if (new Set(decisions).size > 1) score.unstableQuestions += 1
    for (const decision of decisions) {
      score.readings += 1
      if (decision !== 'PERSON') {
        score.automated += 1
        if (decision === expected) score.automatedCorrect += 1
        else score.automatedWrong += 1
      } else if (expected === 'PERSON') score.personExpected += 1
      else score.sentToPerson += 1
    }
  }
  return score
}
