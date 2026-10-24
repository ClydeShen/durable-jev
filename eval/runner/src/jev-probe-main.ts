import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JevJudge } from '@durable-jev/model-providers'
import {
  assertPackHashes,
  createExperimentDirectory,
  fileHash,
  packHashes,
  sourceRevision,
  writeEvidence,
} from './experiment-evidence.js'
import { prepareGatePack } from './gate-change-packs.js'
import { budgetedJevFetch, readJevAllowance } from './jev-allowance.js'
import { observeJevProbe, probeCases } from './jev-probe.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const ledger = join(root, '.harness/jev-allowance.jsonl')

async function prepare() {
  if (process.env.MODEL_MODE === 'live') throw new Error('prepare is offline; use scripted mode')
  const run = createExperimentDirectory(root, 'jev-probe')
  const source = join(root, 'eval/materials')
  const baseline = join(run, 'baseline')
  cpSync(source, baseline, { recursive: true, errorOnExist: true })
  for (const mutation of ['P2', 'P3'] as const)
    prepareGatePack(baseline, join(run, mutation), mutation, true)
  const cases = []
  for (const spec of probeCases)
    cases.push({ spec, control: await observeJevProbe(spec, join(run, spec.mutation)) })
  const plan = {
    ...sourceRevision(root),
    generatedAt: new Date().toISOString(),
    authorization: 'jev-2026-10-24',
    step: 'authoring-review',
    plannedRequests: 3,
    labelStatus: 'draft development fixtures; not blind or independent authoring evidence',
    sourceHashes: packHashes(source),
    implementationHashes: packHashes(join(root, 'eval/runner/dist')),
    packHashes: { P2: packHashes(join(run, 'P2')), P3: packHashes(join(run, 'P3')) },
    cases,
  }
  const path = join(run, 'plan.json')
  writeEvidence(path, plan)
  process.stdout.write(`Offline plan: ${path}\nSHA256: ${fileHash(path)}\nNo real requests made.\n`)
  return plan
}

function loadFrozenPlan(run: string, expectedHash: string) {
  const path = join(run, 'plan.json')
  if (!expectedHash || fileHash(path) !== expectedHash) throw new Error('plan hash mismatch')
  const plan = JSON.parse(readFileSync(path, 'utf8')) as Awaited<ReturnType<typeof prepare>>
  const source = sourceRevision(root)
  if (plan.sourceCommit !== source.sourceCommit || plan.sourceStatus || source.sourceStatus)
    throw new Error('freeze the plan from the current clean commit before live use')
  if (
    plan.authorization !== 'jev-2026-10-24' ||
    plan.step !== 'authoring-review' ||
    plan.plannedRequests !== 3 ||
    plan.cases.length !== 3
  )
    throw new Error('unrecognized live probe plan')
  if (JSON.stringify(plan.cases.map((sample) => sample.spec)) !== JSON.stringify(probeCases))
    throw new Error('probe cases changed')
  assertPackHashes(join(root, 'eval/materials'), plan.sourceHashes)
  assertPackHashes(join(root, 'eval/runner/dist'), plan.implementationHashes)
  for (const mutation of ['P2', 'P3'] as const)
    assertPackHashes(join(run, mutation), plan.packHashes[mutation])
  return plan
}

async function live(runDirectory: string, expectedHash: string) {
  if (process.env.MODEL_MODE !== 'live') throw new Error('live requires MODEL_MODE=live')
  const run = resolve(runDirectory)
  const plan = loadFrozenPlan(run, expectedHash)
  const before = readJevAllowance(ledger)
  if (
    before.filter((entry) => entry.step === 'authoring-review').length + 3 > 5 ||
    before.length + 3 > 20
  )
    throw new Error('insufficient allowance for this three-request probe; do not reset the journal')
  const output = join(run, 'live')
  mkdirSync(output) // Existing output refuses accidental replay, even after a partial failure.
  const observations = []
  for (const sample of plan.cases) {
    const result = await callProbe(run, sample)
    writeEvidence(join(output, `${sample.spec.id}.json`), result)
    observations.push(result)
    if ('error' in result) break
  }
  const after = readJevAllowance(ledger)
  writeEvidence(join(run, 'report.json'), {
    planHash: expectedHash,
    sourceCommit: plan.sourceCommit,
    modelMode: 'hybrid',
    scope:
      'three selected semantic inputs; all other judgments scripted; no live generation, blind or savings claim',
    before,
    after,
    observations,
  })
  process.stdout.write(
    `Reserved ${after.length - before.length} requests; total ${after.length}/20. Report: ${join(run, 'report.json')}\n`,
  )
  process.exitCode = observations.some((entry) => 'error' in entry) ? 1 : 0
}

async function callProbe(
  run: string,
  sample: Awaited<ReturnType<typeof prepare>>['cases'][number],
) {
  let httpStatus: number | undefined
  const transport = budgetedJevFetch(
    ledger,
    'authoring-review',
    `${fileURLToPath(import.meta.url)}:${run}:${sample.spec.id}`,
    async (url, init) => {
      const response = await fetch(url, init)
      httpStatus = response.status
      return response
    },
  )
  try {
    const judge = new JevJudge({ fetch: transport, timeoutMs: 30_000 })
    const answer = await judge.ask(sample.control.input.question, sample.control.input.state)
    const observed = await observeJevProbe(sample.spec, join(run, sample.spec.mutation), {
      input: sample.control.input,
      answer,
    })
    return { spec: sample.spec, httpStatus, answer, control: sample.control, observed }
  } catch (error) {
    return {
      spec: sample.spec,
      httpStatus,
      error: error instanceof Error ? error.name : 'unknown error',
    }
  }
}

const [mode, directory, hash] = process.argv.slice(2)
if (mode === 'prepare') await prepare()
else if (mode === 'live' && directory && hash) await live(directory, hash)
else
  throw new Error(
    'usage: eval:jev-probe prepare | eval:jev-probe live <run directory> <plan sha256>',
  )
