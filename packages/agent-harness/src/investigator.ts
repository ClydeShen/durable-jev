import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { Message, Provider } from '@earendil-works/pi-ai'
import { createModels } from '@earendil-works/pi-ai/models'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import {
  type ConversationId,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  hook,
  type JsonObject,
  MemoryStorage,
  type ModelRef,
  type Storage,
  ToolTask,
} from '@earendil-works/pi-durable'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { assembleInput, type InvestigationTool } from './tools.js'

const context = BACKGROUND_CONTEXT

/** A tool result as the scripted model sees it. */
export interface ObservedResult {
  tool: string
  result: unknown
}

export type ScriptedStep = { call: string; args: JsonObject } | { answer: string }

/**
 * Where the helper's reasoning comes from. `scripted` decides each step from the tool results so
 * far, with no model call; `live` uses a real provider.
 */
export type InvestigatorModel =
  | { kind: 'scripted'; next(results: readonly ObservedResult[]): ScriptedStep }
  | { kind: 'live'; provider: Provider; modelId: string }

export interface RunBudget {
  maxToolCalls: number
  hardStopMs: number
}

const defaultBudget: RunBudget = { maxToolCalls: 10, hardStopMs: 60_000 }

export interface ToolCallRecord<Scope> {
  scope: Scope
  tool: string
  args: unknown
  blocked?: string
}

export interface InvestigatorOptions<Scope> {
  /** SQLite file for durable runs, or `memory` for runs that need not survive a restart. */
  storage: string
  instructions: string
  tools: readonly InvestigationTool<Scope>[]
  /** Resolves the business scope (for example the case) a conversation investigates. */
  scopeOf(conversationId: ConversationId): Scope | undefined
  model: InvestigatorModel
  budget?: Partial<RunBudget>
  onToolCall?(record: ToolCallRecord<Scope>): void
}

export type RunOutcome =
  | { status: 'finished'; answer: string }
  | { status: 'unanswered'; reason: string }
  | { status: 'timedOut' }

class ScopeError extends Error {
  constructor(conversationId: ConversationId) {
    super(`conversation ${conversationId} has no investigation scope`)
    this.name = 'ScopeError'
  }
}

function observedResults(messages: readonly Message[]): ObservedResult[] {
  return messages.flatMap((message) => {
    if (message.role !== 'toolResult') return []
    const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
    try {
      return [{ tool: message.toolName, result: JSON.parse(text) }]
    } catch {
      return [{ tool: message.toolName, result: text }]
    }
  })
}

function modelSource(model: InvestigatorModel): { provider: Provider; ref: ModelRef } {
  if (model.kind === 'live') {
    return {
      provider: model.provider,
      ref: { provider: model.provider.id, modelId: model.modelId },
    }
  }
  const faux = fauxProvider({ provider: 'scripted', models: [{ id: 'investigator' }] })
  const respond = (transcript: { messages: Message[] }) => {
    faux.appendResponses([respond])
    const step = model.next(observedResults(transcript.messages))
    return 'call' in step
      ? fauxAssistantMessage(fauxToolCall(step.call, step.args), { stopReason: 'toolUse' })
      : fauxAssistantMessage(fauxText(step.answer))
  }
  faux.setResponses([respond])
  return { provider: faux.provider, ref: { provider: 'scripted', modelId: 'investigator' } }
}

async function openStorage(storage: string): Promise<Storage> {
  return storage === 'memory' ? new MemoryStorage() : openNodeSqliteStorage(storage)
}

/**
 * Runs the investigation helper on Pi Durable: each investigation is its own conversation, tool
 * results are checkpointed, and a run interrupted by a crash continues from its last checkpoint
 * when `run` is called again with the same request id.
 */
export class DurableInvestigator<Scope> {
  private constructor(
    private readonly harness: Harness,
    private readonly modelRef: ModelRef,
    private readonly options: InvestigatorOptions<Scope>,
    private readonly budget: RunBudget,
  ) {}

  static async open<ToolScope>(
    options: InvestigatorOptions<ToolScope>,
  ): Promise<DurableInvestigator<ToolScope>> {
    const budget = { ...defaultBudget, ...options.budget }
    // Counted in memory: a restart resets the count, and restarts are capped by the caller.
    const toolCalls = new Map<ConversationId, number>()
    const scopeOf = (conversationId: ConversationId) => {
      const scope = options.scopeOf(conversationId)
      if (scope === undefined) throw new ScopeError(conversationId)
      return scope
    }
    const tools = options.tools.map((tool) =>
      defineTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        replay: 'safe',
        execute: async (args, api) => {
          const scope = scopeOf(api.conversationId)
          options.onToolCall?.({ scope, tool: tool.name, args })
          const result = await tool.execute(args, scope)
          return { output: [{ type: 'text', text: JSON.stringify(result) }] }
        },
      }),
    )
    const runBudget = hook(ToolTask, {
      beforeTool: (call, api) => {
        const used = toolCalls.get(api.conversationId) ?? 0
        if (used < budget.maxToolCalls) {
          toolCalls.set(api.conversationId, used + 1)
          return undefined
        }
        const blocked = `tool budget of ${budget.maxToolCalls} calls is used up; stop and answer`
        options.onToolCall?.({
          scope: scopeOf(api.conversationId),
          tool: call.name,
          args: call.arguments,
          blocked,
        })
        return { block: blocked }
      },
    })
    const registry = createRegistry()
    registry.install(defineExtension({ name: 'investigation', tools, hooks: [runBudget] }))
    const { provider, ref } = modelSource(options.model)
    const models = createModels()
    models.setProvider(provider)
    const harness = await Harness.open(
      await openStorage(options.storage),
      { models, registry, settings: { toolExecution: 'sequential' } },
      context,
    )
    return new DurableInvestigator(harness, ref, options, budget)
  }

  /** Creates the conversation for a new investigation and returns its id. */
  async begin(): Promise<ConversationId> {
    const conversation = await this.harness.createConversation(
      {
        ownership: { kind: 'ownerless' },
        agent: { model: this.modelRef, instructions: this.options.instructions },
      },
      context,
    )
    return conversation.id
  }

  /** Starts or, after a restart, continues the investigation with this request id. */
  async run(
    conversationId: ConversationId,
    requestId: string,
    task: string,
    data: unknown,
  ): Promise<RunOutcome> {
    const conversation = await this.harness.conversation(conversationId, context)
    if (!conversation) throw new ScopeError(conversationId)
    const submission = await conversation.submit(
      { type: 'input', content: assembleInput(task, data), requestId },
      context,
    )
    let timer: NodeJS.Timeout | undefined
    const timedOut = new Promise<'timedOut'>((resolve) => {
      timer = setTimeout(() => resolve('timedOut'), this.budget.hardStopMs)
    })
    const settled = await Promise.race([submission.wait(context), timedOut])
    clearTimeout(timer)
    if (settled === 'timedOut') {
      await submission.abort(context)
      return { status: 'timedOut' }
    }
    if (settled.status === 'unanswered') {
      return { status: 'unanswered', reason: settled.reason }
    }
    return { status: 'finished', answer: await this.lastAnswer(conversationId) }
  }

  async close(): Promise<void> {
    await this.harness.close(context)
  }

  private async lastAnswer(conversationId: ConversationId): Promise<string> {
    const conversation = await this.harness.conversation(conversationId, context)
    const view = await conversation?.context(context)
    const last = view?.messages.findLast((message) => message.role === 'assistant')
    return last?.role === 'assistant'
      ? last.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
      : ''
  }
}
