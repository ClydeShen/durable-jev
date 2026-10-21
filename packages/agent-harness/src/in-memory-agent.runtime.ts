import type { AgentModel, ModelTurn, TranscriptEntry } from './agent-model.js'
import type {
  AgentEvent,
  AgentRuntime,
  AgentSession,
  RunHandle,
  RunOutcome,
  SessionKey,
} from './agent-runtime.js'
import type { ContextAssembler, DataSection } from './context-assembler.js'
import { defaultRunBudget, type RunBudget, RunBudgetGuard } from './run-budget-guard.js'
import type { ToolContext } from './tool.js'
import type { ToolRegistry } from './tool-registry.js'

export type AgentRunOptions<Input> = {
  registry: ToolRegistry
  model: AgentModel
  assembler: ContextAssembler
  describe(input: Input): { task: string; data: readonly DataSection[] }
  // The only way a run produces a result: a successful call of this tool.
  resultTool: string
  budget?: RunBudget
  now?: () => number
}

// Keeps everything in process memory. A crash loses the run, which is exactly what the
// durable runtime is compared against.
export class InMemoryAgentRuntime<Input> implements AgentRuntime<Input> {
  constructor(private readonly options: AgentRunOptions<Input>) {}

  async open(sessionKey: SessionKey): Promise<AgentSession<Input>> {
    return new InMemoryAgentSession(sessionKey, this.options)
  }
}

class InMemoryAgentSession<Input> implements AgentSession<Input> {
  private readonly runs = new Map<string, RunHandle>()
  private readonly log: AgentEvent[] = []

  constructor(
    private readonly sessionKey: SessionKey,
    private readonly options: AgentRunOptions<Input>,
  ) {}

  async submit(request: { requestId: string; input: Input }): Promise<RunHandle> {
    const existing = this.runs.get(request.requestId)
    if (existing) return existing
    const runId = `${this.sessionKey.caseId}:r${this.sessionKey.caseRevision}:${this.sessionKey.purpose}:${request.requestId}`
    const handle = { runId, outcome: this.run(runId, request.input) }
    this.runs.set(request.requestId, handle)
    return handle
  }

  async resume(): Promise<RunHandle | undefined> {
    return undefined
  }

  events(): readonly AgentEvent[] {
    return this.log
  }

  async close(): Promise<void> {}

  private async run(runId: string, input: Input): Promise<RunOutcome> {
    const { registry, model, assembler, resultTool } = this.options
    const guard = RunBudgetGuard.start(this.options.budget ?? defaultRunBudget, this.options.now)
    const context = assembler.assemble(this.options.describe(input))
    const tools = registry.toolsFor('agent').map(({ name, description }) => ({ name, description }))
    const toolContext: ToolContext = {
      runId,
      caseId: this.sessionKey.caseId,
      caseRevision: this.sessionKey.caseRevision,
      operationIdFor: (logicalActionId) => `${runId}:${logicalActionId}`,
    }
    const transcript: TranscriptEntry[] = []
    const escalate = (reason: RunOutcome & { status: 'escalated' }): RunOutcome => {
      this.log.push({ type: 'run.escalated', runId, reason: reason.reason, detail: reason.detail })
      return reason
    }
    this.log.push({ type: 'run.started', runId })

    while (true) {
      const time = guard.checkTime()
      if (!time.allowed)
        return escalate({ status: 'escalated', reason: time.limit, detail: time.detail })

      let turn: ModelTurn | undefined
      while (!turn) {
        try {
          this.log.push({
            type: 'model.called',
            runId,
            provider: model.provider,
            modelId: model.modelId,
          })
          turn = await model.next({ context, tools, transcript })
        } catch (error) {
          const retry = guard.beforeModelRetry()
          if (!retry.allowed) {
            return escalate({
              status: 'escalated',
              reason: retry.limit,
              detail: `${retry.detail}; last error: ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }
      }
      transcript.push({
        role: 'model',
        toolCalls: turn.toolCalls,
        ...(turn.text ? { text: turn.text } : {}),
      })
      if (turn.toolCalls.length === 0) {
        return escalate({
          status: 'escalated',
          reason: 'noResult',
          detail: `the model stopped without calling ${resultTool}`,
        })
      }

      for (const call of turn.toolCalls) {
        const budget = guard.beforeToolCall()
        if (!budget.allowed) {
          return escalate({ status: 'escalated', reason: budget.limit, detail: budget.detail })
        }
        const result = await registry.call(call.name, call.input, 'agent', toolContext)
        this.log.push(
          result.ok
            ? { type: 'tool.called', runId, tool: call.name, ok: true }
            : { type: 'tool.called', runId, tool: call.name, ok: false, error: result.error.code },
        )
        transcript.push({ role: 'tool', callId: call.callId, name: call.name, result })
        if (result.ok && call.name === resultTool) {
          this.log.push({ type: 'run.completed', runId, result: result.output })
          return { status: 'completed', result: result.output }
        }
      }
    }
  }
}
