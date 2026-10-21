import type { CaseRuntime, CaseStore, CaseView } from '@durable-jev/agent-core'
import { type Actor, HttpError } from '@durable-jev/service-kit'

export async function dispatchCase(
  runtime: CaseRuntime,
  store: CaseStore,
  caseId: string,
  actor: Actor,
  now: () => string,
): Promise<CaseView> {
  if (actor.role !== 'dispatcher')
    throw new HttpError(403, 'only a dispatcher confirms the release')
  const evaluated = await runtime.evaluate(caseId)
  store.transaction(() => {
    const current = store.caseRecord(caseId)
    if (current?.dispatchedAt) throw new HttpError(409, `${caseId} is already dispatched`)
    if (current?.shipment.caseRevision !== evaluated.record.shipment.caseRevision) {
      throw new HttpError(409, `${caseId} changed while confirming; review it again`)
    }
    const release = store.outcomes(caseId).find((outcome) => outcome.ruleId === 'R40')
    if (release?.status !== 'PASS') {
      throw new HttpError(
        409,
        `R40 is ${release?.status ?? 'not evaluated'}; blocked by ${release?.blockedBy.join(', ') || 'nothing'}`,
      )
    }
    store.markDispatched(caseId, now())
    store.record({
      caseId,
      eventName: 'case.dispatched',
      payload: { caseRevision: evaluated.record.shipment.caseRevision, confirmedBy: actor.id },
    })
  })
  return runtime.view(caseId)
}
