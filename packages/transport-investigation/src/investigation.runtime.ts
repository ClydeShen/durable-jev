import {
  type AgentModel,
  ContextAssembler,
  InMemoryAgentRuntime,
  type RunBudget,
} from '@durable-jev/agent-harness'
import {
  type InvestigationDependencies,
  type InvestigationRequest,
  investigationTools,
  resultToolName,
} from './investigation.tools.js'
import { ScriptedInvestigatorModel } from './scripted-investigator.model.js'

export const investigatorInstructions = [
  'You help a transport planner replace a carrier that can no longer serve a leg.',
  'Find carriers and vehicles with the tools, check each candidate with check_candidate, and submit one proposal with submit_investigation_result.',
  'You cannot change the plan, approve anything or contact carriers. The planner decides.',
]

export function describeInvestigation(request: InvestigationRequest) {
  return {
    task: `Leg ${request.legId} needs a replacement for ${request.unavailableCarrierIds.join(', ')}.`,
    data: [{ source: 'reportedReason', content: request.reason }],
  }
}

export function createInvestigationRuntime(
  dependencies: InvestigationDependencies & {
    model?: AgentModel
    budget?: RunBudget
    now?: () => number
  },
) {
  return new InMemoryAgentRuntime<InvestigationRequest>({
    registry: investigationTools(dependencies),
    model: dependencies.model ?? new ScriptedInvestigatorModel(dependencies.request.legId),
    assembler: new ContextAssembler(investigatorInstructions),
    describe: describeInvestigation,
    resultTool: resultToolName,
    ...(dependencies.budget ? { budget: dependencies.budget } : {}),
    ...(dependencies.now ? { now: dependencies.now } : {}),
  })
}
