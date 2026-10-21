import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { SemanticAnswer } from '@durable-jev/contracts'
import { buildSemanticQuestions, JevJudge, RetryingJudge } from '@durable-jev/model-providers'
import { listCaseIds, loadCase, loadReferenceData } from './materials.helpers.js'
import {
  decide,
  type Reading,
  type Score,
  scoreReadings,
  type Thresholds,
} from './reading-score.helpers.js'
import { loadReplayConfiguration } from './replay.service.js'

// Asks real Jev every semantic question of the eight cases and scores the answers against what
// the reviewer expects. It costs quota, so it only runs with MODEL_MODE=live.
if (process.env.MODEL_MODE !== 'live' || !process.env.TYPESAFE_API_KEY) {
  console.error(
    'This calls the real Jev model. Run it with MODEL_MODE=live and TYPESAFE_API_KEY set.',
  )
  process.exit(2)
}
const repeats = Number(process.argv.find((arg) => arg.startsWith('--repeats='))?.slice(10) ?? 3)

const configuration = loadReplayConfiguration()
const referenceData = loadReferenceData()
const numeric = (name: string) => Number(configuration.policy[name] ?? 0)
const base: Thresholds = {
  passAtLeast: numeric('semanticNoulPassAtLeast'),
  failAtMost: numeric('semanticNoulFailAtMost'),
  choiceMinProbability: numeric('semanticChoiceMinProbability'),
  reviewBand: numeric('semanticNoulReviewBand'),
}
const semanticRuleIds = new Set(
  configuration.rulesInEvaluationOrder
    .filter((rule) => rule.evaluator.kind === 'semantic')
    .map((rule) => rule.ruleId as string),
)

const jev = new RetryingJudge(new JevJudge({ apiKey: process.env.TYPESAFE_API_KEY }))
const items: Reading[] = []
for (const caseName of listCaseIds()) {
  const caseFile = loadCase(caseName)
  const questions = buildSemanticQuestions({
    templates: configuration.semanticQuestions,
    ruleIds: semanticRuleIds,
    shipment: caseFile.shipment,
    evidence: caseFile.evidence,
    glossary: { referenceData, categoryDefinitions: configuration.categoryDefinitions },
  }).filter((question) =>
    caseFile.scriptedSemanticAnswers.some(
      (label) => label.ruleId === question.ruleId && label.entityId === question.entityId,
    ),
  )
  const asked: Map<string, SemanticAnswer[]> = new Map()
  for (let run = 0; run < repeats; run += 1) {
    for (const judgement of await jev.ask(questions)) {
      const key = `${judgement.ruleId}@${judgement.entityId}`
      asked.set(key, [...(asked.get(key) ?? []), judgement.answer])
    }
  }
  for (const label of caseFile.scriptedSemanticAnswers) {
    const readings = asked.get(`${label.ruleId}@${label.entityId}`)
    if (readings)
      items.push({
        caseId: caseFile.caseId,
        ruleId: label.ruleId,
        entityId: label.entityId,
        expected: label.answer,
        readings,
      })
  }
}

const show = (answer: SemanticAnswer) =>
  answer.type === 'noul'
    ? answer.noul.toFixed(2)
    : `${answer.choice} ${(answer.probabilities[answer.choice] ?? 0).toFixed(2)}`
const lines = [
  '| Case | Rule | Expected | Readings | Decision without band | Decision with band |',
  '|---|---|---|---|---|---|',
]
for (const item of items)
  lines.push(
    `| ${item.caseId} | ${item.ruleId} | ${show(item.expected)} | ${item.readings.map(show).join(', ')} | ${item.readings.map((reading) => decide(reading, { ...base, reviewBand: 0 })).join(', ')} | ${item.readings.map((reading) => decide(reading, base)).join(', ')} |`,
  )

const percent = (part: number, whole: number) =>
  whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`
const summarise = (label: string, score: Score) =>
  `${label}: ${percent(score.automated, score.readings)} answered without a person; of those, ${percent(score.automatedCorrect, score.automated)} match the expected answer (${score.automatedWrong} wrong); ${score.sentToPerson} readings sent to a person that did not need one; ${score.unstableQuestions} of ${score.questions} questions decided differently between runs.`
const withoutBand = scoreReadings(items, { ...base, reviewBand: 0 })
const withBand = scoreReadings(items, base)
const report = [
  `Real Jev, ${items.length} labelled questions, ${repeats} runs each (${withBand.readings} readings).`,
  '',
  summarise('Without a review band', withoutBand),
  summarise(`With a ${base.reviewBand} review band`, withBand),
  '',
  ...lines,
].join('\n')
console.log(report)

const reportPath = resolve(import.meta.dirname, '../../../var/reports/accuracy.md')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${report}\n`)
writeFileSync(
  reportPath.replace(/\.md$/, '.json'),
  `${JSON.stringify({ withoutBand, withBand, items }, null, 2)}\n`,
)
console.log(`\nReport: ${reportPath}`)
