import {
  type AgentEvent,
  type AgentRunOptions,
  type AgentRuntime,
  type AgentSession,
  defaultRunBudget,
  type EscalationReason,
  type ModelTurn,
  RunBudgetGuard,
  type RunHandle,
  type RunOutcome,
  type SessionKey,
  type ToolCall,
  type ToolContext,
  type ToolResult,
  type TranscriptEntry,
} from '@durable-jev/agent-harness'
import type { StoreDatabase } from '@durable-jev/store'
import { currentTraceparent, type Telemetry, withSpan } from '@durable-jev/telemetry'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { Type } from '@earendil-works/pi-ai'
import { createModels } from '@earendil-works/pi-ai/models'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { createRegistry, defineExtension, defineTool, Harness } from '@earendil-works/pi-durable'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { z } from 'zod'
import { RunStore, type StoredRun } from './run.repository.js'

export type PiRuntimeOptions<Input> = AgentRunOptions<Input> & {
  // Pi Durable's own store; one process may own it at a time.
  storagePath: string
  // Holds the budget state and outcome of each run (see piRuntimeMigrations).
  stateDatabase: StoreDatabase
  // Optional: run events and spans, written to the service's own outbox.
  telemetry?: Telemetry
}

const context = BACKGROUND_CONTEXT
const providerName = 'durable-jev'
const maxModelTurns = 200

type ActiveRun = { runId: string; guard: RunBudgetGuard }

// Pi Durable keeps the transcript and replays it after a crash: finished read-only tools are
// read back, an unfinished write tool reports `interrupted` instead of running twice. The
// budget, the restart limit and the result stay with this project (Pi 1.3.0 has neither).
export class PiDurableAgentRuntime<Input> implements AgentRuntime<Input> {
  constructor(private readonly options: PiRuntimeOptions<Input>) {}

  async open(sessionKey: SessionKey): Promise<AgentSession<Input>> {
    return PiDurableAgentSession.open(sessionKey, this.options)
  }
}

class PiDurableAgentSession<Input> implements AgentSession<Input> {
  private readonly log: AgentEvent[] = []
  private readonly runs: RunStore
  private active: ActiveRun | undefined

  private constructor(
    private readonly sessionKey: SessionKey,
    private readonly options: PiRuntimeOptions<Input>,
    private readonly harness: Harness,
  ) {
    this.runs = new RunStore(options.stateDatabase)
  }

  static async open<Input>(sessionKey: SessionKey, options: PiRuntimeOptions<Input>) {
    let session: PiDurableAgentSession<Input> | undefined
    const model = fauxProvider({ provider: providerName, models: [{ id: options.model.modelId }] })
    model.setResponses(
      Array.from(
        { length: maxModelTurns },
        () => (request: { messages: readonly unknown[] }) =>
          (session as PiDurableAgentSession<Input>).nextModelMessage(request.messages),
      ),
    )
    const models = createModels()
    models.setProvider(model.provider)
    const registry = createRegistry()
    const harness = await Harness.open(
      await openNodeSqliteStorage(options.storagePath),
      { models, registry, settings: { toolExecution: 'sequential' } },
      context,
    )
    session = new PiDurableAgentSession(sessionKey, options, harness)
    registry.install(defineExtension({ name: 'durable-jev-tools', tools: session.piTools() }))
    return session
  }

  private get prefix() {
    const { caseId, caseRevision, purpose } = this.sessionKey
    return `${caseId}:r${caseRevision}:${purpose}:`
  }

  async submit(request: { requestId: string; input: Input }): Promise<RunHandle> {
    const runId = `${this.prefix}${request.requestId}`
    const existing = this.runs.find(runId)
    if (existing?.outcome) return { runId, outcome: Promise.resolve(existing.outcome) }
    if (existing) return this.continueAfterRestart(existing)
    const guard = RunBudgetGuard.start(this.options.budget ?? defaultRunBudget, this.options.now)
    this.runs.insert({
      runId,
      requestId: request.requestId,
      input: request.input,
      budget: guard.snapshot(),
    })
    this.log.push({ type: 'run.started', runId })
    return {
      runId,
      outcome: this.attempt(runId, 1, undefined, () => this.drive(runId, request.input, guard)),
    }
  }

  // After the process died: continue the oldest unfinished run of this session, if any.
  async resume(): Promise<RunHandle | undefined> {
    const [unfinished] = this.runs.unfinished(this.prefix)
    return unfinished && this.continueAfterRestart(unfinished)
  }

  events(): readonly AgentEvent[] {
    return this.log
  }

  async close(): Promise<void> {
    await this.harness.close(context)
  }

  private continueAfterRestart(stored: StoredRun): RunHandle {
    const guard = RunBudgetGuard.restore(
      stored.budget,
      this.options.budget ?? defaultRunBudget,
      this.options.now,
    )
    const decision = guard.beforeRestart()
    this.runs.saveBudget(stored.runId, guard.snapshot())
    this.log.push({ type: 'run.resumed', runId: stored.runId, restart: guard.snapshot().restarts })
    if (!decision.allowed) {
      return {
        runId: stored.runId,
        outcome: Promise.resolve(this.escalate(stored.runId, decision.limit, decision.detail)),
      }
    }
    const attempt = guard.snapshot().restarts + 1
    return {
      runId: stored.runId,
      outcome: this.attempt(stored.runId, attempt, stored.traceparent, () =>
        this.drive(stored.runId, stored.input as Input, guard),
      ),
    }
  }

  // One span per attempt. A resumed attempt is a new trace with a link to the previous one, and
  // its start is recorded as an event so the link has something to point at even though the
  // killed attempt never finished its own span.
  private attempt<T>(
    runId: string,
    attempt: number,
    previousTraceparent: string | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    const { caseId } = this.sessionKey
    return withSpan(
      attempt === 1 ? 'agent.run' : 'agent.run.resumed',
      {
        caseId,
        caseRevision: this.sessionKey.caseRevision,
        runId,
        attempt,
        root: attempt > 1,
        ...(previousTraceparent
          ? { links: [{ traceparent: previousTraceparent, relation: 'resumes' }] }
          : {}),
      },
      () => {
        const traceparent = currentTraceparent()
        if (traceparent) this.runs.saveTraceparent(runId, traceparent)
        const { telemetry } = this.options
        if (attempt > 1) {
          telemetry?.emit({
            eventName: 'run.interrupted',
            caseId,
            runId,
            attempt: attempt - 1,
            severity: 'warn',
            attributes: { detectedBy: 'restart' },
          })
        }
        telemetry?.emit({
          eventName: attempt === 1 ? 'run.started' : 'run.resumed',
          caseId,
          runId,
          attempt,
        })
        return work()
      },
    )
  }

  private async drive(runId: string, input: Input, guard: RunBudgetGuard): Promise<RunOutcome> {
    this.active = { runId, guard }
    try {
      const assembled = this.options.assembler.assemble(this.options.describe(input))
      const root = await this.harness.root(context, {
        agent: {
          model: { provider: providerName, modelId: this.options.model.modelId },
          instructions: assembled.system,
        },
      })
      // Same request id after a restart: Pi returns the same submission and continues it.
      const submission = await root.submit(
        { type: 'input', content: assembled.data || 'Start.', requestId: runId },
        context,
      )
      await submission.wait(context)
      return (
        this.runs.find(runId)?.outcome ??
        this.escalate(
          runId,
          'noResult',
          `the model stopped without calling ${this.options.resultTool}`,
        )
      )
    } finally {
      this.active = undefined
    }
  }

  private escalate(runId: string, reason: EscalationReason, detail: string): RunOutcome {
    const outcome = this.runs.finish(runId, { status: 'escalated', reason, detail })
    if (outcome.status === 'escalated') {
      this.log.push({
        type: 'run.escalated',
        runId,
        reason: outcome.reason,
        detail: outcome.detail,
      })
    }
    return outcome
  }

  private isFinished(runId: string) {
    return this.runs.find(runId)?.outcome !== undefined
  }

  private async nextModelMessage(messages: readonly unknown[]) {
    const active = this.active
    if (!active || this.isFinished(active.runId)) return stopMessage('The run has finished.')
    const time = active.guard.checkTime()
    if (!time.allowed) {
      this.escalate(active.runId, time.limit, time.detail)
      return stopMessage('Time budget exhausted.')
    }
    const transcript = toTranscript(messages)
    const tools = this.options.registry
      .toolsFor('agent')
      .map(({ name, description }) => ({ name, description }))
    const assembled = this.options.assembler.assemble(
      this.options.describe(this.runs.find(active.runId)?.input as Input),
    )
    let turn: ModelTurn | undefined
    while (!turn) {
      try {
        this.log.push({
          type: 'model.called',
          runId: active.runId,
          provider: this.options.model.provider,
          modelId: this.options.model.modelId,
        })
        turn = await this.options.model.next({ context: assembled, tools, transcript })
      } catch (error) {
        const retry = active.guard.beforeModelRetry()
        this.runs.saveBudget(active.runId, active.guard.snapshot())
        if (!retry.allowed) {
          this.escalate(
            active.runId,
            retry.limit,
            `${retry.detail}; last error: ${error instanceof Error ? error.message : String(error)}`,
          )
          return stopMessage('Model retries exhausted.')
        }
      }
    }
    if (turn.toolCalls.length === 0) return stopMessage(turn.text ?? 'Done.')
    const round = transcript.filter((entry) => entry.role === 'model').length
    return fauxAssistantMessage(
      turn.toolCalls.map((call) =>
        fauxToolCall(call.name, call.input as Parameters<typeof fauxToolCall>[1], {
          id: `${round}:${call.callId}`,
        }),
      ),
      { stopReason: 'toolUse' },
    )
  }

  private piTools() {
    const { registry, resultTool } = this.options
    return registry.toolsFor('agent').map((tool) =>
      defineTool({
        name: tool.name,
        description: tool.description,
        parameters: Type.Unsafe(z.toJSONSchema(tool.inputSchema)),
        ...(tool.replayPolicy === 'replaySafe' ? { replay: 'safe' as const } : {}),
        execute: async (args) => {
          const active = this.active
          if (!active || this.isFinished(active.runId)) {
            return errorResult({ code: 'BUDGET_EXCEEDED', message: 'the run has finished' })
          }
          const budget = active.guard.beforeToolCall()
          this.runs.saveBudget(active.runId, active.guard.snapshot())
          if (!budget.allowed) {
            this.escalate(active.runId, budget.limit, budget.detail)
            return errorResult({ code: 'BUDGET_EXCEEDED', message: budget.detail })
          }
          const result = await registry.call(
            tool.name,
            args,
            'agent',
            this.toolContext(active.runId),
          )
          this.log.push(
            result.ok
              ? { type: 'tool.called', runId: active.runId, tool: tool.name, ok: true }
              : {
                  type: 'tool.called',
                  runId: active.runId,
                  tool: tool.name,
                  ok: false,
                  error: result.error.code,
                },
          )
          if (result.ok && tool.name === resultTool) {
            const outcome = this.runs.finish(active.runId, {
              status: 'completed',
              result: result.output,
            })
            if (outcome.status === 'completed') {
              this.log.push({ type: 'run.completed', runId: active.runId, result: outcome.result })
            }
          }
          return result.ok
            ? { output: [{ type: 'text' as const, text: JSON.stringify(result.output) }] }
            : errorResult(result.error)
        },
      }),
    )
  }

  private toolContext(runId: string): ToolContext {
    return {
      runId,
      caseId: this.sessionKey.caseId,
      caseRevision: this.sessionKey.caseRevision,
      operationIdFor: (logicalActionId) => `${runId}:${logicalActionId}`,
    }
  }
}

const stopMessage = (text: string) => fauxAssistantMessage(fauxText(text), { stopReason: 'stop' })

const errorResult = (error: { code: string; message: string }) => ({
  output: [{ type: 'text' as const, text: JSON.stringify(error) }],
  isError: true,
})

const stripRound = (id: string) => id.slice(id.indexOf(':') + 1)

type PiContent = { type: string; id?: string; name?: string; arguments?: unknown; text?: string }
type PiMessage = {
  role: string
  content?: string | PiContent[]
  toolCallId?: string
  toolName?: string
  isError?: boolean
}

// Rebuilds our transcript from Pi's, so the model sees the same history after a restart.
const toTranscript = (messages: readonly unknown[]): TranscriptEntry[] => {
  return (messages as PiMessage[]).flatMap((message): TranscriptEntry[] => {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const toolCalls: ToolCall[] = message.content
        .filter((content) => content.type === 'toolCall')
        .map((content) => ({
          callId: stripRound(content.id ?? ''),
          name: content.name ?? '',
          input: content.arguments,
        }))
      return [{ role: 'model', toolCalls }]
    }
    if (message.role === 'toolResult') {
      const text = Array.isArray(message.content)
        ? message.content.map((content) => content.text ?? '').join('')
        : (message.content ?? '')
      return [
        {
          role: 'tool',
          callId: stripRound(message.toolCallId ?? ''),
          name: message.toolName ?? '',
          result: toToolResult(text, message.isError === true),
        },
      ]
    }
    return []
  })
}

const toToolResult = (text: string, isError: boolean): ToolResult => {
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // Pi's own messages, such as an interrupted call, are plain text.
  }
  if (!isError) return { ok: true, output: parsed }
  const error = parsed as { code?: string; message?: string }
  return typeof error === 'object' && error?.code && error.message
    ? { ok: false, error: error as Extract<ToolResult, { ok: false }>['error'] }
    : { ok: false, error: { code: 'EXECUTION_FAILED', message: text } }
}
