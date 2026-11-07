import { createHash } from 'node:crypto'
import type { CaseStore } from '@durable-jev/agent-core'
import { defineInvestigationTool } from '@durable-jev/agent-harness'
import { canonicalJson, type Shipment } from '@durable-jev/contracts'
import { runOnce } from '@durable-jev/store'
import { Type } from '@earendil-works/pi-ai'

interface EvidenceScope {
  caseId: string
  caseRevision: number
  investigationId: string
}

function documentFingerprint(document: Shipment['documents'][number]): string {
  return createHash('sha256').update(canonicalJson(document)).digest('hex')
}

function currentShipment(cases: CaseStore<Shipment>, scope: EvidenceScope) {
  const shipment = cases.caseRecord(scope.caseId)?.data
  return shipment?.caseRevision === scope.caseRevision ? shipment : undefined
}

function readEvidenceTool(cases: CaseStore<Shipment>) {
  return defineInvestigationTool({
    name: 'read_case_evidence',
    description: 'Read documents from the current case revision, including citation fingerprints.',
    parameters: Type.Object({}),
    execute: (_args, scope: EvidenceScope) => {
      const shipment = currentShipment(cases, scope)
      if (!shipment) return { error: 'CASE_NOT_CURRENT' }
      return {
        caseRevision: shipment.caseRevision,
        documents: shipment.documents.map((document) => ({
          ...document,
          fingerprint: documentFingerprint(document),
        })),
      }
    },
  })
}

function submitEvidenceTool(cases: CaseStore<Shipment>) {
  return defineInvestigationTool({
    name: 'submit_evidence_draft',
    description:
      'Record one investigation draft for human review, citing current documents. Does not approve or release the shipment.',
    parameters: Type.Object({
      summary: Type.String({ minLength: 1 }),
      unresolved: Type.Array(Type.String({ minLength: 1 })),
      citations: Type.Array(
        Type.Object({
          documentId: Type.String({ minLength: 1 }),
          version: Type.Integer({ minimum: 1 }),
          fingerprint: Type.String({ pattern: '^[a-f0-9]{64}$' }),
        }),
        { minItems: 1, uniqueItems: true },
      ),
    }),
    execute: (args, scope: EvidenceScope) =>
      cases.transaction(() => {
        const shipment = currentShipment(cases, scope)
        if (!shipment) return { recorded: false, error: 'CASE_NOT_CURRENT' }
        const valid = args.citations.every((citation) => {
          const matches = shipment.documents.filter((doc) => doc.documentId === citation.documentId)
          const document = matches.length === 1 ? matches[0] : undefined
          return (
            document?.version === citation.version &&
            documentFingerprint(document) === citation.fingerprint
          )
        })
        if (!valid) return { recorded: false, error: 'CITATION_NOT_CURRENT' }
        const result = runOnce(
          cases.db,
          {
            operationId: canonicalJson(['evidence-draft', scope]),
            kind: 'evidence-draft',
            request: args,
          },
          () => {
            cases.record({
              caseId: scope.caseId,
              eventName: 'investigation.evidence_draft',
              payload: { ...scope, ...args, reviewStatus: 'draft' },
            })
            return { reviewStatus: 'draft' }
          },
        )
        return { recorded: result.status === 'applied', ...result }
      }),
  })
}

/** Scoped document access and a review draft only; no business decision or case mutation. */
export function evidenceTools(cases: CaseStore<Shipment>) {
  return [readEvidenceTool(cases), submitEvidenceTool(cases)]
}
