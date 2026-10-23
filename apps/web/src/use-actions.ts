import type { HumanTask, Shipment } from '@durable-jev/contracts'
import { type Actor, api, type Investigation, type TaskDecision } from './api'

/**
 * What the presenter can do, each reporting its outcome in a message and refreshing the page's
 * data afterwards.
 */
export function useActions(
  actor: Actor,
  onMessage: (message: string) => void,
  refresh: () => Promise<unknown>,
) {
  const report = async (work: () => Promise<unknown>, success: string) => {
    try {
      await work()
      onMessage(success)
    } catch (failure) {
      onMessage(failure instanceof Error ? failure.message : String(failure))
    }
    await refresh()
  }
  return {
    reset: () => report(() => api.reset(), 'Demo data reset'),
    resetCase: (caseId: string, onReset: (caseId: string) => void) =>
      report(async () => {
        await api.resetCase(caseId)
        onReset(caseId)
      }, `${caseId} starts over`),
    submitOrder: (sampleId: string, shipment: Shipment, onCreated: (caseId: string) => void) =>
      report(
        async () => onCreated((await api.submitOrder(sampleId, shipment)).caseId),
        'Order submitted; every agent is evaluating it from the start',
      ),
    decide: (task: HumanTask, decision: TaskDecision) =>
      report(() => api.decide(task.humanTaskId, decision, actor), `${task.ruleId} submitted`),
    dispatch: (caseId: string) => report(() => api.dispatch(caseId, actor), 'Dispatch confirmed'),
    revise: (caseId: string, index: number) =>
      report(() => api.revise(caseId, index), 'Change applied and evaluated again'),
    reportIncident: (caseId: string, index: number) =>
      report(
        () => api.reportIncident(caseId, index),
        'Transport agent notified; its investigation helper is investigating',
      ),
    decideProposal: (investigation: Investigation, type: 'confirm' | 'reject') =>
      report(
        () => api.decideProposal(investigation.investigationId, type, actor),
        type === 'confirm'
          ? 'Reroute confirmed; the affected agents are evaluating again'
          : 'Reroute proposal rejected',
      ),
    controlService: (agentId: string, verb: 'crash' | 'start') =>
      report(
        () => api.controlService(agentId, verb),
        verb === 'crash' ? `${agentId} stopped` : `${agentId} restarting`,
      ),
  }
}
