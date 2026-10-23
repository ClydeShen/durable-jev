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
      onMessage(String(failure))
    }
    await refresh()
  }
  return {
    reset: () => report(() => api.reset(), '演示数据已重置'),
    submitOrder: (sampleId: string, shipment: Shipment, onCreated: (caseId: string) => void) =>
      report(
        async () => onCreated((await api.submitOrder(sampleId, shipment)).caseId),
        '订单已提交，各 agent 正在从头评估',
      ),
    decide: (task: HumanTask, decision: TaskDecision) =>
      report(() => api.decide(task.humanTaskId, decision, actor), `${task.ruleId} 已提交`),
    dispatch: (caseId: string) => report(() => api.dispatch(caseId, actor), '已确认发运'),
    revise: (caseId: string, index: number) =>
      report(() => api.revise(caseId, index), '已应用变更并重新评估'),
    reportIncident: (caseId: string, index: number) =>
      report(() => api.reportIncident(caseId, index), '已通知运输 agent，调查助手开始调查'),
    decideProposal: (investigation: Investigation, type: 'confirm' | 'reject') =>
      report(
        () => api.decideProposal(investigation.investigationId, type, actor),
        type === 'confirm' ? '已确认改派，相关 agent 正在重新评估' : '已否决改派提议',
      ),
    controlService: (agentId: string, verb: 'crash' | 'start') =>
      report(
        () => api.controlService(agentId, verb),
        verb === 'crash' ? `${agentId} 已终止` : `${agentId} 正在重启`,
      ),
  }
}
