import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CaseStore } from '@durable-jev/agent-core'
import {
  DurableInvestigator,
  type InvestigatorModel,
  type ToolCallRecord,
} from '@durable-jev/agent-harness'
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

async function runEvidence(f: ReturnType<typeof fixture>, model: InvestigatorModel) {
  const calls: ToolCallRecord<typeof f.scope>[] = []
  const opened = await DurableInvestigator.open({
    storage: 'memory',
    tools: f.tools,
    scopeOf: () => f.scope,
    instructions: 'Read documents and submit a draft for human review.',
    model,
    onToolCall: (record) => calls.push(record),
  })
  try {
    const outcome = await opened.run(await opened.begin(), 'draft-run', 'Investigate packaging', {})
    return {
      outcome,
      calls,
      executed: calls.filter((call) => !call.blocked).map((call) => call.tool),
    }
  } finally {
    await opened.close()
  }
}

it('runs logistics evidence tools through Pi without changing the shipment or human tasks', async () => {
  const f = fixture()
  try {
    const { outcome: result } = await runEvidence(f, {
      kind: 'scripted',
      next: (results) => {
        if (!results.length) return { call: 'read_case_evidence', args: {} }
        if (results.length === 1) return { call: 'submit_evidence_draft', args: f.args }
        return { answer: JSON.stringify(results.at(-1)?.result) }
      },
    })
    expect(result.status).toBe('finished')
    if (result.status === 'finished') expect(JSON.parse(result.answer).status).toBe('applied')
    expect(f.cases.caseRecord(f.scope.caseId)?.data).toEqual(f.shipment)
    expect(f.cases.caseRecord(f.scope.caseId)?.completedAt).toBeUndefined()
    expect(f.cases.tasksOf(f.scope.caseId)).toEqual([])
    expect(unpublishedEvents(f.cases.db).map((event) => event.eventName)).toEqual([
      'investigation.evidence_draft',
    ])
  } finally {
    f.cases.db.close()
  }
})

it.each(['empty-citations', 'missing-summary', 'bad-fingerprint', 'bad-version'])(
  'Pi rejects %s before executing the draft tool',
  async (mutation) => {
    const f = fixture()
    try {
      const args = structuredClone(f.args)
      const citation = args.citations[0]
      if (!citation) throw new Error('missing citation')
      if (mutation === 'empty-citations') args.citations = []
      if (mutation === 'missing-summary') Reflect.deleteProperty(args, 'summary')
      if (mutation === 'bad-fingerprint') citation.fingerprint = 'not-a-hash'
      if (mutation === 'bad-version') Reflect.set(citation, 'version', 'one')
      const { outcome, executed, calls } = await runEvidence(f, {
        kind: 'scripted',
        next: (results) =>
          results.length
            ? { answer: JSON.stringify(results) }
            : { call: 'submit_evidence_draft', args },
      })
      expect(outcome.status).toBe('finished')
      if (outcome.status === 'finished')
        expect(outcome.answer).toMatch(/invalid|validat|argument|schema/i)
      expect(executed).toEqual([])
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({
        scope: f.scope,
        tool: 'submit_evidence_draft',
        rejectionCode: 'invalid_arguments',
      })
      expect(calls[0]?.callId).toBeTruthy()
      expect(unpublishedEvents(f.cases.db)).toEqual([])
      expect(f.cases.caseRecord(f.scope.caseId)?.data).toEqual(f.shipment)
    } finally {
      f.cases.db.close()
    }
  },
)

it('Pi refuses an unregistered dispatch tool without invoking a domain executor', async () => {
  const f = fixture()
  try {
    const { outcome, executed, calls } = await runEvidence(f, {
      kind: 'scripted',
      next: (results) =>
        results.length
          ? { answer: JSON.stringify(results) }
          : { call: 'dispatch_order', args: { caseId: f.scope.caseId } },
    })
    expect(outcome.status).toBe('finished')
    if (outcome.status === 'finished')
      expect(outcome.answer).toMatch(/unknown|not found|not registered|not available|no tool/i)
    expect(executed).toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      scope: f.scope,
      tool: 'dispatch_order',
      rejectionCode: 'tool_unavailable',
    })
    expect(unpublishedEvents(f.cases.db)).toEqual([])
    expect(f.cases.caseRecord(f.scope.caseId)?.completedAt).toBeUndefined()
  } finally {
    f.cases.db.close()
  }
})

it('isolates citations and idempotency for two cases sharing document and investigation IDs', () => {
  const f = fixture()
  try {
    const other = structuredClone(f.shipment)
    other.caseId = 'LOG-OTHER'
    for (const doc of other.documents) doc.text = `Other case: ${doc.text}`
    f.cases.putCase(other, '2026-10-24T00:00:00Z')
    const scope = { ...f.scope, caseId: other.caseId }
    expect(f.submit.execute(f.args, scope)).toEqual({
      recorded: false,
      error: 'CITATION_NOT_CURRENT',
    })
    const evidence = f.read.execute({}, scope) as { documents: typeof f.args.citations }
    const citations = evidence.documents.map(({ documentId, version, fingerprint }) => ({
      documentId,
      version,
      fingerprint,
    }))
    expect(f.submit.execute(f.args, f.scope)).toMatchObject({ recorded: true })
    expect(f.submit.execute({ ...f.args, citations }, scope)).toMatchObject({ recorded: true })
    expect(unpublishedEvents(f.cases.db).map((event) => event.caseId)).toEqual([
      f.scope.caseId,
      other.caseId,
    ])
    expect(f.cases.caseRecord(other.caseId)?.data).toEqual(other)
    expect(f.cases.caseRecord(f.scope.caseId)?.data).toEqual(f.shipment)
  } finally {
    f.cases.db.close()
  }
})

it('model arguments cannot redirect evidence reads to another stored case', async () => {
  const f = fixture()
  try {
    const other = structuredClone(f.shipment)
    other.caseId = 'LOG-OTHER'
    for (const doc of other.documents) doc.text = 'PRIVATE-OTHER-CASE'
    f.cases.putCase(other, '2026-10-24T00:00:00Z')
    const { outcome, executed } = await runEvidence(f, {
      kind: 'scripted',
      next: (results) =>
        results.length
          ? { answer: JSON.stringify(results) }
          : { call: 'read_case_evidence', args: { caseId: other.caseId } },
    })
    expect(outcome.status).toBe('finished')
    expect(executed).toEqual([])
    if (outcome.status === 'finished') {
      expect(outcome.answer).toMatch(/invalid|argument|additional/i)
      expect(outcome.answer).not.toContain('PRIVATE-OTHER-CASE')
    }
    expect(unpublishedEvents(f.cases.db)).toEqual([])
  } finally {
    f.cases.db.close()
  }
})

it('refuses model-supplied draft scope fields and preserves trusted metadata for direct callers', async () => {
  const f = fixture()
  const args = {
    ...f.args,
    caseId: 'FORGED',
    caseRevision: 999,
    investigationId: 'FORGED',
    reviewStatus: 'approved',
  }
  try {
    const { executed, calls } = await runEvidence(f, {
      kind: 'scripted',
      next: (results) =>
        results.length
          ? { answer: JSON.stringify(results) }
          : { call: 'submit_evidence_draft', args },
    })
    expect(executed).toEqual([])
    expect(calls[0]?.rejectionCode).toBe('invalid_arguments')
    expect(unpublishedEvents(f.cases.db)).toEqual([])
    expect(f.submit.execute(args, f.scope)).toMatchObject({ recorded: true })
    const [event] = unpublishedEvents(f.cases.db)
    expect(event?.caseId).toBe(f.scope.caseId)
    expect(event?.payload).toEqual({ ...f.args, ...f.scope, reviewStatus: 'draft' })
    expect(f.submit.execute(f.args, f.scope)).toMatchObject({ status: 'duplicate' })
  } finally {
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
