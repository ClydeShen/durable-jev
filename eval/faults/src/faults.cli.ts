import { runFaults, writeReport } from './faults.js'

const runs = await runFaults(process.argv.slice(2))
for (const run of runs) {
  console.log(`${run.passed ? 'PASS' : 'FAIL'}  ${run.id}  ${run.title}`)
  for (const line of run.observations) console.log(`        ${line}`)
}
const failed = runs.filter((run) => !run.passed).length
console.log(`\n${runs.length - failed}/${runs.length} fault scenarios passed`)
console.log(`Report: ${writeReport(runs)}`)
process.exit(failed === 0 ? 0 : 1)
