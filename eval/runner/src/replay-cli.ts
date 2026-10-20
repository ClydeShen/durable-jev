import { replayAllCases } from './replay.js'

const results = await replayAllCases()
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
