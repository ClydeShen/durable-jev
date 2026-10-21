import type { CaseRuntime, CaseStore, CaseView } from '@durable-jev/agent-core'
import type { Role } from '@durable-jev/contracts'

export type DispatchResult =
  | { ok: true; view: CaseView }
  | {
      ok: false
      reason: 'NOT_DISPATCHER' | 'ALREADY_DISPATCHED' | 'CHANGED' | 'NOT_RELEASABLE'
      message: string
    }

type Refusal = Extract<DispatchResult, { ok: false }>

function releaseRefusal(
  store: CaseStore,
  caseId: string,
  evaluatedRevision: number,
): Refusal | undefined {
  const current = store.caseRecord(caseId)
  if (current?.dispatchedAt)
    return { ok: false, reason: 'ALREADY_DISPATCHED', message: `${caseId} is already dispatched` }
  if (current?.shipment.caseRevision !== evaluatedRevision) {
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
  runtime: CaseRuntime,
  store: CaseStore,
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
  const evaluated = await runtime.evaluate(caseId)
  const refusal = store.transaction(() => {
    const blocked = releaseRefusal(store, caseId, evaluated.record.shipment.caseRevision)
    if (blocked) return blocked
    store.markDispatched(caseId, now())
    store.record({
      caseId,
      eventName: 'case.dispatched',
      payload: { caseRevision: evaluated.record.shipment.caseRevision, confirmedBy: actor.id },
    })
    return undefined
  })
  return refusal ?? { ok: true, view: runtime.view(caseId) }
}
