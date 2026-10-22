import { documentMatchQuestion, inspectionState, packagingRiskQuestion } from './fixtures.js'
import { JevJudge } from './jev-judge.js'
import type { SemanticJudge } from './semantic-judge.js'
import { StructuredOutputJudge } from './structured-output-judge.js'

const judges: SemanticJudge[] = [new JevJudge(), new StructuredOutputJudge()]
let failures = 0

for (const question of [packagingRiskQuestion, documentMatchQuestion]) {
  for (const judge of judges) {
    try {
      const answer = await judge.ask(question, inspectionState)
      console.log(
        [
          question.questionId,
          judge.provider,
          answer.modelId,
          JSON.stringify(answer.judgement),
          JSON.stringify(answer.usage),
          `${answer.durationMs}ms`,
        ].join(' | '),
      )
    } catch (error) {
      failures += 1
      console.error(`${question.questionId} | ${judge.provider} | ${String(error)}`)
    }
  }
}

process.exitCode = failures === 0 ? 0 : 1
