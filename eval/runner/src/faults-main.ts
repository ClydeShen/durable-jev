import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scenarios } from './faults/scenarios.js'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const reportDirectory = join(repositoryRoot, 'var/reports')
const only = new Set(process.argv.slice(2))

const lines = [
  '# Fault scenarios',
  '',
  '| ID | Scenario | Result | Evidence |',
  '|---|---|---|---|',
]
let failures = 0
for (const scenario of scenarios.filter((candidate) => only.size === 0 || only.has(candidate.id))) {
  const { outcome, evidence } = await scenario.run().catch((error: unknown) => ({
    outcome: 'fail' as const,
    evidence: `threw ${String(error)}`,
  }))
  if (outcome === 'fail') failures++
  lines.push(`| ${scenario.id} | ${scenario.title} | ${outcome} | ${evidence} |`)
}
lines.push('', failures === 0 ? 'All scenarios held.' : `${failures} scenarios failed.`)
mkdirSync(reportDirectory, { recursive: true })
writeFileSync(join(reportDirectory, 'faults.md'), `${lines.join('\n')}\n`)
process.stdout.write(`${lines.join('\n')}\n`)
process.exitCode = failures === 0 ? 0 : 1
