import type { CaseOrchestrator, CaseStore } from '@durable-jev/agent-core'
import type { Role } from '@durable-jev/contracts'

export type DispatchResult =
  | { ok: true }
  | {
      ok: false
      reason: 'NOT_DISPATCHER' | 'ALREADY_DISPATCHED' | 'CHANGED' | 'NOT_RELEASABLE'
      message: string
    }

type Refusal = Extract<DispatchResult, { ok: false }>

function releaseRefusal(
  store: CaseStore,
  caseId: string,
  reviewedRevision: number | undefined,
): Refusal | undefined {
  const current = store.caseRecord(caseId)
  if (current?.dispatchedAt)
    return { ok: false, reason: 'ALREADY_DISPATCHED', message: `${caseId} is already dispatched` }
  if (current?.shipment.caseRevision !== reviewedRevision) {
    return {
      ok: false,
      reason: 'CHANGED',
      message: `${caseId} changed while confirming; review it again`,
    }
  }
  const release = store.outcomes(caseId).find((outcome) => outcome.ruleId === 'R40')
  if (release?.status !== 'PASS') {
    return {
      ok: false,
      reason: 'NOT_RELEASABLE',
      message: `R40 is ${release?.status ?? 'not evaluated'}; blocked by ${release?.blockedBy.join(', ') || 'nothing'}`,
    }
  }
  return undefined
}

export async function dispatchCase(
  orchestrator: CaseOrchestrator,
  coordinationStore: CaseStore,
  caseId: string,
  actor: { id: string; role: Role },
  now: () => string,
): Promise<DispatchResult> {
  if (actor.role !== 'dispatcher') {
    return {
      ok: false,
      reason: 'NOT_DISPATCHER',
      message: 'only a dispatcher confirms the release',
    }
  }
  const reviewedRevision = coordinationStore.caseRecord(caseId)?.shipment.caseRevision
  await orchestrator.propagate(caseId)
  const refusal = coordinationStore.transaction(() => {
    const blocked = releaseRefusal(coordinationStore, caseId, reviewedRevision)
    if (blocked) return blocked
    coordinationStore.markDispatched(caseId, now())
    coordinationStore.record({
      caseId,
      eventName: 'case.dispatched',
      payload: { caseRevision: reviewedRevision, confirmedBy: actor.id },
    })
    return undefined
  })
  return refusal ?? { ok: true }
}
