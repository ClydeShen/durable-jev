import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCaseCatalog } from '@durable-jev/logistics'
import { replayCase } from './replay.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const materials = join(repositoryRoot, 'eval/materials')
const reportDirectory = join(repositoryRoot, 'var/reports')

const replays = []
for (const caseFile of loadCaseCatalog(join(materials, 'cases')).values()) {
  replays.push(await replayCase(caseFile, materials))
}

const lines = ['# Replay report', '', '| Case | Step | Result |', '|---|---|---|']
for (const replay of replays) {
  for (const step of replay.steps) {
    lines.push(
      `| ${replay.caseId} | ${step.label} | ${step.problems.length === 0 ? 'ok' : step.problems.join('; ')} |`,
    )
  }
}
const failed = replays.flatMap((replay) => replay.steps).filter((step) => step.problems.length > 0)
lines.push('', `${replays.length} cases, ${failed.length} failing steps.`)

mkdirSync(reportDirectory, { recursive: true })
writeFileSync(join(reportDirectory, 'replay.md'), `${lines.join('\n')}\n`)
process.stdout.write(`${lines.join('\n')}\n`)
process.exitCode = failed.length === 0 ? 0 : 1
