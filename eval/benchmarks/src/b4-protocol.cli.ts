import { mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, resolve } from 'node:path'
import { A2aTaskLinks, a2aBranchEvaluator, a2aClientMigrations } from '@durable-jev/a2a-adapter'
import {
  branchServiceMigrations,
  createBranchServiceApp,
  httpBranchEvaluator,
} from '@durable-jev/branch-service'
import type { BranchEvaluationRequest } from '@durable-jev/contracts'
import { loadCase, loadReferenceData, loadReplayConfiguration } from '@durable-jev/eval-runner'
import { evaluateBranch } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { milliseconds, summarise } from './bench-stats.helpers.js'

// B4: the same branch service answered over its native HTTP interface and over A2A, no model
// involved. Every call is a different order, so neither side can answer from a stored task.
// Two sides are called in alternation on the same machine; the first call of each is reported
// separately from the warm ones.
const calls = Number(process.argv.find((arg) => arg.startsWith('--calls='))?.slice(8) ?? 200)

const configuration = loadReplayConfiguration()
const referenceData = loadReferenceData()
const logOne = loadCase('LOG-001')

let baseUrl = ''
const app = createBranchServiceApp({
  serviceName: 'commercial-control',
  branches: ['commercial'],
  configuration,
  referenceData,
  database: openDatabase(':memory:', branchServiceMigrations),
  publicUrl: () => baseUrl,
})
const server = app.listen(0)
await new Promise((resolveListening) => server.once('listening', resolveListening))
baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const baseResults = evaluateBranch(
  {
    caseId: logOne.caseId,
    caseRevision: 1,
    shipment: logOne.shipment,
    evidence: { documents: [], temperatureLogs: [], inspectionNotes: [] },
    semanticAnswers: logOne.scriptedSemanticAnswers,
    upstreamResults: [],
    humanGates: [],
  } as unknown as BranchEvaluationRequest,
  { configuration, referenceData, branches: ['base'] },
).evaluations

const requestFor = (index: number): BranchEvaluationRequest =>
  ({
    caseId: `BENCH-${index}`,
    caseRevision: 1,
    shipment: { ...logOne.shipment, caseId: `BENCH-${index}` },
    evidence: { documents: [], temperatureLogs: [], inspectionNotes: [] },
    semanticAnswers: logOne.scriptedSemanticAnswers,
    upstreamResults: baseResults,
    humanGates: [],
  }) as unknown as BranchEvaluationRequest

const native = httpBranchEvaluator('commercial-control', ['commercial'], baseUrl)
const a2a = a2aBranchEvaluator(
  'commercial-control',
  ['commercial'],
  baseUrl,
  new A2aTaskLinks(openDatabase(':memory:', a2aClientMigrations)),
)

const nativeTimes: number[] = []
const a2aTimes: number[] = []
let same = 0
for (let index = 0; index < calls + 1; index += 1) {
  const request = requestFor(index)
  // Alternate which side goes first so neither gets the warmer caches.
  const order = index % 2 === 0 ? ['native', 'a2a'] : ['a2a', 'native']
  const results: Record<string, unknown> = {}
  for (const side of order) {
    const evaluator = side === 'native' ? native : a2a
    const start = performance.now()
    results[side] = await evaluator.evaluate(request)
    ;(side === 'native' ? nativeTimes : a2aTimes).push(performance.now() - start)
  }
  if (JSON.stringify(results.native) === JSON.stringify(results.a2a)) same += 1
}
server.close()

const [nativeCold = 0, ...nativeWarm] = nativeTimes
const [a2aCold = 0, ...a2aWarm] = a2aTimes
const nativeSummary = summarise(nativeWarm)
const a2aSummary = summarise(a2aWarm)
const report = [
  `B4 protocol overhead: ${calls} warm calls per side plus the first call, same machine, no model.`,
  '',
  '| | First call | Warm p50 | Warm p95 | Warm mean |',
  '|---|---|---|---|---|',
  `| Native HTTP | ${milliseconds(nativeCold)} | ${milliseconds(nativeSummary.p50)} | ${milliseconds(nativeSummary.p95)} | ${milliseconds(nativeSummary.mean)} |`,
  `| A2A | ${milliseconds(a2aCold)} | ${milliseconds(a2aSummary.p50)} | ${milliseconds(a2aSummary.p95)} | ${milliseconds(a2aSummary.mean)} |`,
  '',
  'The first call of each side includes cold-start work, and the side that goes first on a cold process pays more; compare the warm numbers.',
  `A2A adds ${milliseconds(a2aSummary.p50 - nativeSummary.p50)} at p50 (${(a2aSummary.p50 / nativeSummary.p50).toFixed(1)}x).`,
  `Identical results over both protocols: ${same} of ${calls + 1} calls.`,
].join('\n')
console.log(report)
const reportPath = resolve(import.meta.dirname, '../../../var/reports/b4-protocol.md')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${report}\n`)
process.exit(same === calls + 1 ? 0 : 1)
