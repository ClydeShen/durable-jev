import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CaseStore } from '@durable-jev/agent-core'
import { canonicalJson, shipmentSchema } from '@durable-jev/contracts'
import { evidenceTools } from '@durable-jev/logistics'
import { unpublishedEvents } from '@durable-jev/store'
import {
  createExperimentDirectory,
  fileHash,
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
try {
  store.putCase(shipment, '2026-10-24T00:00:00Z')
  const [read, submit] = evidenceTools(store)
  if (!read || !submit) throw new Error('missing evidence tools')
  const evidence = read.execute({}, scope) as {
    documents: { documentId: string; version: number; fingerprint: string }[]
  }
  const citations = evidence.documents.map(({ documentId, version, fingerprint }) => ({
    documentId,
    version,
    fingerprint,
  }))
  const args = {
    summary: 'Packaging evidence needs human review before any conclusion.',
    unresolved: ['This authored control does not interpret the documents.'],
    citations,
  }
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
  writeEvidence(join(directory, 'report.json'), {
    ...sourceRevision(root),
    inputHash: fileHash(input),
    implementationHashes: Object.fromEntries(
      [
        'packages/logistics/dist/evidence-tools.js',
        'packages/store/dist/operations.js',
        'eval/runner/dist/evidence-draft-main.js',
        'pnpm-lock.yaml',
      ].map((path) => [path, fileHash(join(root, path))]),
    ),
    reviewStatus: 'draft',
    controller: 'authored direct-tool control',
    runtimeModelCalls: 0,
    humanMinutes: null,
    scope,
    evidence,
    args,
    accepted,
    repeated,
    events,
    limitations: ['No model reasoning, Pi checkpoint recovery or independent business review.'],
  })
  process.stdout.write(
    `Scoped draft recorded once; shipment unchanged. Report: ${join(directory, 'report.json')}\n`,
  )
} finally {
  store.db.close()
}
