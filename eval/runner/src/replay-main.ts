import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCaseCatalog } from '@durable-jev/logistics'
import { JevJudge } from '@durable-jev/model-providers'
import { replayCase } from './replay.js'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const materials = join(repositoryRoot, 'eval/materials')
const reportDirectory = join(repositoryRoot, 'var/reports')

const live = process.env.MODEL_MODE === 'live'
const liveJudge = live ? new JevJudge() : undefined
const only = new Set(process.argv.slice(2))
const replays = []
for (const caseFile of loadCaseCatalog(join(materials, 'cases')).values()) {
  if (only.size > 0 && !only.has(caseFile.shipment.caseId)) continue
  replays.push(await replayCase(caseFile, materials, liveJudge))
}

const lines = [
  `# Replay report (${live ? 'live models' : 'scripted'})`,
  '',
  '| Case | Step | Result |',
  '|---|---|---|',
]
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
writeFileSync(join(reportDirectory, live ? 'replay-live.md' : 'replay.md'), `${lines.join('\n')}\n`)
process.stdout.write(`${lines.join('\n')}\n`)
process.exitCode = failed.length === 0 ? 0 : 1
