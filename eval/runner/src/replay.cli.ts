import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { judgeForModelMode, judgeMigrations } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { replayAllCases } from './replay.js'

// MODEL_MODE=live asks Jev; judgements are cached on disk so a rerun costs no quota.
const cachePath = resolve(
  process.env.SEMANTIC_CACHE_DB ??
    resolve(import.meta.dirname, '../../../var/data/semantic-cache.sqlite'),
)
const live = process.env.MODEL_MODE === 'live'
if (live) mkdirSync(dirname(cachePath), { recursive: true })
const judgeFor = live
  ? judgeForModelMode('live', {
      apiKey: process.env.TYPESAFE_API_KEY,
      cacheDatabase: openDatabase(cachePath, judgeMigrations),
    })
  : undefined

const results = await replayAllCases({
  caseIds: process.argv.slice(2),
  ...(judgeFor && { judgeFor }),
})
console.log(`Semantic judge: ${live ? `live Jev (cache ${cachePath})` : 'scripted answers'}\n`)
for (const result of results) {
  const marker = result.passed ? 'PASS' : 'FAIL'
  console.log(`${marker}  ${result.caseId}  ${result.title}  (${result.reviewStatus})`)
  for (const stage of result.stages) {
    const stageMarker = stage.failures.length === 0 ? 'ok ' : 'XX '
    console.log(`      ${stageMarker} ${stage.index + 1}. ${stage.step}`)
    for (const failure of stage.failures) console.log(`           ${failure}`)
  }
}
const failed = results.filter((result) => !result.passed).length
console.log(`\n${results.length - failed}/${results.length} cases passed`)
process.exit(failed === 0 ? 0 : 1)
