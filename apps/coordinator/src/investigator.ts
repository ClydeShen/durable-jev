import type { RunOutcome } from '@durable-jev/agent-harness'
import type { ReferenceData } from '@durable-jev/contracts'
import type { RuleConfiguration } from '@durable-jev/rule-evaluation'
import {
  createInvestigationRuntime,
  type InvestigationCase,
  type InvestigationRequest,
} from '@durable-jev/transport-investigation'

export type InvestigationRun = {
  runId: string
  modelId: string
  toolCalls: number
  outcome: RunOutcome
}

export type Investigator = (input: {
  investigated: InvestigationCase
  request: InvestigationRequest
  requestId: string
}) => Promise<InvestigationRun>

export function inProcessInvestigator(
  configuration: RuleConfiguration,
  referenceData: ReferenceData,
): Investigator {
  return async ({ investigated, request, requestId }) => {
    const runtime = createInvestigationRuntime({
      investigated,
      request,
      configuration,
      referenceData,
    })
    const session = await runtime.open({
      caseId: investigated.caseId,
      caseRevision: investigated.caseRevision,
      purpose: 'replace-carrier',
    })
    const run = await session.submit({ requestId, input: request })
    const outcome = await run.outcome
    const events = session.events()
    const modelCall = events.find((event) => event.type === 'model.called')
    return {
      runId: run.runId,
      modelId: modelCall?.type === 'model.called' ? modelCall.modelId : 'unknown',
      toolCalls: events.filter((event) => event.type === 'tool.called').length,
      outcome,
    }
  }
}
