import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { milliseconds, summarise } from './bench-stats.helpers.js'

// B3: the same investigation loop, tools and scripted model, killed at the same points, with
// and without persisted execution state. Scripted answers keep the loop identical, so any
// difference is the runtime's. Each fault point runs several times per runtime.
const repositoryRoot = resolve(import.meta.dirname, '../../..')
const fixture = 'packages/transport-investigation/src/pi-investigation-process.fixture.ts'
const trials = Number(process.argv.find((arg) => arg.startsWith('--trials='))?.slice(9) ?? 5)

const faultPoints = [
  { crashAt: 'list_candidate_carriers:1', says: 'before the first tool finished' },
  { crashAt: 'check_candidate:1', says: 'after the carrier listing finished' },
  { crashAt: 'check_candidate:2', says: 'after one candidate check finished' },
  { crashAt: 'submit_investigation_result:1', says: 'inside the write that records the proposal' },
]
const runtimes = [
  { name: 'in-memory', env: 'memory' },
  { name: 'Pi Durable', env: 'pi' },
] as const

const run = (directory: string, phase: string, env: Record<string, string>) => {
  const started = performance.now()
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsx', resolve(repositoryRoot, fixture), directory, phase],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  )
  return { exitCode: result.status, stdout: result.stdout, ms: performance.now() - started }
}
const executions = (directory: string) => {
  try {
    return readFileSync(join(directory, 'executions.log'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}
const lastJson = (stdout: string) => {
  try {
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}')
  } catch {
    return {}
  }
}

type Cell = {
  recovered: number
  duplicateWrites: number
  extraExecutions: number[]
  recoveryMs: number[]
  statuses: Set<string>
}
const rows: string[] = []
for (const runtime of runtimes) {
  const baseline = mkdtempSync(join(tmpdir(), 'b3-baseline-'))
  run(baseline, 'start', { RUNTIME: runtime.env })
  const baselineAttempts = executions(baseline).filter((name) => !name.endsWith(':done')).length
  rmSync(baseline, { recursive: true, force: true })
  for (const point of faultPoints) {
    const cell: Cell = {
      recovered: 0,
      duplicateWrites: 0,
      extraExecutions: [],
      recoveryMs: [],
      statuses: new Set(),
    }
    for (let trial = 0; trial < trials; trial += 1) {
      const directory = mkdtempSync(join(tmpdir(), 'b3-'))
      try {
        run(directory, 'start', { RUNTIME: runtime.env, CRASH_AT: point.crashAt })
        const resumed = run(directory, 'resume', { RUNTIME: runtime.env })
        const report = resumed.exitCode === 0 ? lastJson(resumed.stdout) : {}
        const status = String(report.outcome?.status ?? `exit ${resumed.exitCode}`)
        cell.statuses.add(status)
        if (status === 'completed' && report.outcome?.result?.carrierId === 'CAR-GLACIER')
          cell.recovered += 1
        const log = executions(directory)
        const attempts = log.filter((name) => !name.endsWith(':done'))
        const writes = log.filter((name) => name === 'submit_investigation_result:done')
        cell.duplicateWrites += Math.max(0, writes.length - 1)
        cell.extraExecutions.push(attempts.length - baselineAttempts)
        cell.recoveryMs.push(resumed.ms)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
    const extra = summarise(cell.extraExecutions)
    rows.push(
      `| ${runtime.name} | ${point.says} | ${cell.recovered}/${trials} | ${[...cell.statuses].join(', ')} | ${cell.duplicateWrites} | ${extra.mean.toFixed(1)} | ${milliseconds(summarise(cell.recoveryMs).p50)} |`,
    )
    console.log(rows.at(-1))
  }
}

const report = [
  `B3 recovery after a crash: scripted model, same loop and tools, ${trials} trials per fault point and runtime.`,
  '',
  '| Runtime | Killed | Recovered to the same proposal | Outcomes | Duplicate writes (completed) | Tool runs repeated (mean) | Recovery time p50 |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
  'A duplicate write is a proposal recorded more than once. The in-memory runtime has nothing to resume, so its recovery is a fresh submission of the same request. "Tool runs repeated" counts tool attempts beyond a crash-free run. Recovery time includes starting a new process.',
].join('\n')
const reportPath = resolve(repositoryRoot, 'var/reports/b3-recovery.md')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${report}\n`)
console.log(`\nReport: ${reportPath}`)
