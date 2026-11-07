import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CaseStore } from '@durable-jev/agent-core'
import { DurableInvestigator } from '@durable-jev/agent-harness'
import { shipmentSchema } from '@durable-jev/contracts'
import { unpublishedEvents } from '@durable-jev/store'
import { expect, it } from 'vitest'
import { loadCaseFile } from './case-file.js'
import { evidenceTools } from './evidence-tools.js'

function fixture(path = ':memory:') {
  const shipment = loadCaseFile(
    fileURLToPath(new URL('../../../eval/materials/cases/LOG-002.json', import.meta.url)),
  ).shipment
  const cases = CaseStore.open(path, shipmentSchema.parse)
  if (!cases.caseRecord(shipment.caseId)) cases.putCase(shipment, '2026-10-24T00:00:00Z')
  const scope = {
    caseId: shipment.caseId,
    caseRevision: shipment.caseRevision,
    investigationId: 'INV-evidence',
  }
  const tools = evidenceTools(cases)
  const [read, submit] = tools
  if (!read || !submit) throw new Error('missing tools')
  const evidence = read.execute({}, scope) as {
    documents: { documentId: string; version: number; fingerprint: string }[]
  }
  const args = {
    summary: 'Packaging evidence needs review.',
    unresolved: ['Confirm handling requirements.'],
    citations: evidence.documents.map(({ documentId, version, fingerprint }) => ({
      documentId,
      version,
      fingerprint,
    })),
  }
  return { cases, shipment, scope, tools, read, submit, args }
}

it('runs logistics evidence tools through Pi without changing the shipment or human tasks', async () => {
  const f = fixture()
  const opened = await DurableInvestigator.open({
    storage: 'memory',
    tools: f.tools,
    scopeOf: () => f.scope,
    instructions: 'Read documents and submit a draft for human review.',
    model: {
      kind: 'scripted',
      next: (results) => {
        if (!results.length) return { call: 'read_case_evidence', args: {} }
        if (results.length === 1) return { call: 'submit_evidence_draft', args: f.args }
        return { answer: JSON.stringify(results.at(-1)?.result) }
      },
    },
  })
  try {
    const result = await opened.run(await opened.begin(), 'draft-run', 'Investigate packaging', {})
    expect(result.status).toBe('finished')
    if (result.status === 'finished') expect(JSON.parse(result.answer).status).toBe('applied')
    expect(f.cases.caseRecord(f.scope.caseId)?.data).toEqual(f.shipment)
    expect(f.cases.caseRecord(f.scope.caseId)?.completedAt).toBeUndefined()
    expect(f.cases.tasksOf(f.scope.caseId)).toEqual([])
    expect(unpublishedEvents(f.cases.db).map((event) => event.eventName)).toEqual([
      'investigation.evidence_draft',
    ])
  } finally {
    await opened.close()
    f.cases.db.close()
  }
})

it.each(['documentId', 'version', 'fingerprint'] as const)(
  'rejects a changed citation %s',
  (field) => {
    const f = fixture()
    try {
      const citation = f.args.citations[0]
      if (!citation) throw new Error('missing citation')
      Object.assign(citation, { [field]: field === 'version' ? 999 : 'f'.repeat(64) })
      expect(f.submit.execute(f.args, f.scope)).toEqual({
        recorded: false,
        error: 'CITATION_NOT_CURRENT',
      })
      expect(unpublishedEvents(f.cases.db)).toEqual([])
    } finally {
      f.cases.db.close()
    }
  },
)

it('rejects changed document contents even if the case and document versions were not bumped', () => {
  const f = fixture()
  try {
    const document = f.shipment.documents[0]
    if (!document) throw new Error('missing document')
    document.text += ' Revised evidence.'
    f.cases.putCase(f.shipment, '2026-10-24T00:01:00Z')
    expect(f.submit.execute(f.args, f.scope)).toEqual({
      recorded: false,
      error: 'CITATION_NOT_CURRENT',
    })
  } finally {
    f.cases.db.close()
  }
})

it.each([{ caseId: 'OTHER-CASE' }, { caseRevision: 999 }])(
  'rejects missing or stale trusted scope %j',
  (change) => {
    const f = fixture()
    try {
      const scope = { ...f.scope, ...change }
      expect(f.read.execute({}, scope)).toEqual({ error: 'CASE_NOT_CURRENT' })
      expect(f.submit.execute(f.args, scope)).toEqual({
        recorded: false,
        error: 'CASE_NOT_CURRENT',
      })
      expect(unpublishedEvents(f.cases.db)).toEqual([])
    } finally {
      f.cases.db.close()
    }
  },
)

it('retains idempotency across database reopen and refuses a conflicting replacement draft', () => {
  const directory = mkdtempSync(join(tmpdir(), 'logistics-evidence-'))
  const path = join(directory, 'case.sqlite')
  const first = fixture(path)
  try {
    first.submit.execute(first.args, first.scope)
  } finally {
    first.cases.db.close()
  }
  const second = fixture(path)
  try {
    expect(second.submit.execute(second.args, second.scope)).toMatchObject({
      recorded: false,
      status: 'duplicate',
    })
    expect(() =>
      second.submit.execute({ ...second.args, summary: 'Replace draft.' }, second.scope),
    ).toThrow('different request')
    expect(unpublishedEvents(second.cases.db)).toHaveLength(1)
  } finally {
    second.cases.db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
