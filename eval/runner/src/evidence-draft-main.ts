import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CaseStore } from '@durable-jev/agent-core'
import { canonicalJson, shipmentSchema } from '@durable-jev/contracts'
import { evidenceTools } from '@durable-jev/logistics'
import { unpublishedEvents } from '@durable-jev/store'
import { evidenceDraftRequest, evidenceTrial } from './evidence-draft-control.js'
import {
  createExperimentDirectory,
  fileHash,
  runExperimentProcess,
  sourceRevision,
  writeEvidence,
} from './experiment-evidence.js'

if (process.env.MODEL_MODE === 'live')
  throw new Error('evidence draft control requires scripted mode')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const directory = createExperimentDirectory(root, 'evidence-draft')
const input = join(root, 'eval/materials/cases/LOG-002.json')
const shipment = shipmentSchema.parse(JSON.parse(readFileSync(input, 'utf8')).shipment)
const store = CaseStore.open(join(directory, 'case.sqlite'), shipmentSchema.parse)
const scope = {
  caseId: shipment.caseId,
  caseRevision: shipment.caseRevision,
  investigationId: 'evidence-control',
}

function recoveryControls() {
  const child = new URL('./evidence-draft-child.js', import.meta.url)
  return ['control', 'before-submit', 'after-write'].map((cut) => {
    const run = join(directory, cut)
    mkdirSync(run)
    writeEvidence(join(run, 'plan.json'), { shipment, cut })
    runExperimentProcess(
      child,
      run,
      cut === 'control' ? 'control' : 'interrupt',
      cut === 'control' ? 0 : 137,
    )
    if (cut !== 'control') {
      assert.deepEqual(JSON.parse(readFileSync(join(run, 'interrupted.json'), 'utf8')), {
        cut,
        exitCode: 137,
      })
      runExperimentProcess(child, run, 'resume', 0)
    }
    const result = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8')) as {
      outcome: { status: string }
      events: { eventName: string; payload: unknown }[]
      record: { data: unknown; completedAt?: string }
      tasks: unknown[]
      attempts: { tool: string }[]
    }
    assert.equal(result.outcome.status, 'finished')
    assert.equal(result.events.length, 1)
    assert.equal(result.events[0]?.eventName, 'investigation.evidence_draft')
    assert.equal(canonicalJson(result.record.data), canonicalJson(shipment))
    assert.equal(result.record.completedAt, undefined)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.attempts.filter((entry) => entry.tool === 'read_case_evidence').length, 1)
    assert.equal(
      result.attempts.filter((entry) => entry.tool === 'submit_evidence_draft').length,
      cut === 'control' ? 1 : 2,
    )
    return { cut, result }
  })
}

try {
  store.putCase(shipment, '2026-10-24T00:00:00Z')
  const [read, submit] = evidenceTools(store)
  if (!read || !submit) throw new Error('missing evidence tools')
  const evidence = read.execute({}, scope) as {
    documents: { documentId: string; version: number; fingerprint: string }[]
  }
  const args = evidenceDraftRequest(evidence)
  const accepted = submit.execute(args, scope)
  const repeated = submit.execute(args, scope)
  assert.equal((accepted as { recorded: boolean }).recorded, true)
  assert.equal((repeated as { status: string }).status, 'duplicate')
  const events = unpublishedEvents(store.db)
  assert.equal(events.length, 1)
  assert.equal(events[0]?.eventName, 'investigation.evidence_draft')
  assert.equal(canonicalJson(store.caseRecord(scope.caseId)?.data), canonicalJson(shipment))
  assert.equal(store.tasksOf(scope.caseId).length, 0)
  assert.equal(store.caseRecord(scope.caseId)?.completedAt, undefined)
  const recovery = recoveryControls()
  for (const observation of recovery) {
    assert.equal(
      canonicalJson(observation.result.events[0]?.payload),
      canonicalJson(events[0]?.payload),
    )
  }
  writeEvidence(join(directory, 'report.json'), {
    ...sourceRevision(root),
    inputHash: fileHash(input),
    implementationHashes: Object.fromEntries(
      [
        'packages/logistics/dist/evidence-tools.js',
        'packages/store/dist/operations.js',
        'eval/runner/dist/evidence-draft-main.js',
        'eval/runner/dist/evidence-draft-child.js',
        'eval/runner/dist/evidence-draft-control.js',
        'packages/agent-harness/dist/investigator.js',
        'pnpm-lock.yaml',
      ].map((path) => [path, fileHash(join(root, path))]),
    ),
    reviewStatus: 'draft',
    controller: 'authored direct-tool control',
    trial: evidenceTrial,
    toolSchemas: [read, submit].map(({ name, parameters }) => ({ name, parameters })),
    runtimeModelCalls: 0,
    humanMinutes: null,
    scope,
    evidence,
    args,
    accepted,
    repeated,
    events,
    recovery,
    limitations: [
      'Both controllers are authored. No model reasoning or independent business review.',
    ],
  })
  process.stdout.write(
    `Direct and Pi controls match; two process-exit recoveries retain one draft and one evidence read. Report: ${join(directory, 'report.json')}\n`,
  )
} finally {
  store.db.close()
}
