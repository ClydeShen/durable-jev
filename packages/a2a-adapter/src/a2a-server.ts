import { randomUUID } from 'node:crypto'
import { type AgentCard, type Message, type Task, TaskState } from '@a2a-js/sdk'
import {
  type A2ARequestHandler,
  AgentEvent,
  type AgentExecutor,
  DefaultRequestHandler,
} from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import {
  BranchEvaluationRequest,
  type BranchEvaluationResult,
  type RuleBranch,
} from '@durable-jev/contracts'
import type { StoreDatabase } from '@durable-jev/store'
import type { Express } from 'express'
import { dataPart, readMessageData } from './parts.js'
import { SqliteTaskStore } from './sqlite-task-store.js'

export const evaluateSkillId = 'evaluate-branches'
export const evaluationArtifactName = 'branch-evaluation'
export const a2aJsonRpcPath = '/a2a/jsonrpc'

export function branchAgentCard(options: {
  serviceName: string
  branches: readonly RuleBranch[]
  baseUrl: string
}): AgentCard {
  return {
    name: options.serviceName,
    description: `Evaluates the ${options.branches.join(' and ')} rules for one order revision`,
    version: '1.0.0',
    supportedInterfaces: [
      {
        url: `${options.baseUrl}${a2aJsonRpcPath}`,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
        tenant: '',
      },
    ],
    provider: undefined,
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: evaluateSkillId,
        name: 'Evaluate rule branches',
        description:
          'Takes a BranchEvaluationRequest as a data part and returns a BranchEvaluationResult artifact',
        tags: [...options.branches],
        examples: [],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        securityRequirements: [],
      },
    ],
    signatures: [],
  }
}

const statusUpdate = (taskId: string, contextId: string, state: TaskState, message?: Message) =>
  AgentEvent.statusUpdate({
    taskId,
    contextId,
    status: { state, message, timestamp: new Date().toISOString() },
    metadata: undefined,
  })

const agentMessage = (taskId: string, contextId: string, value: unknown): Message =>
  ({
    messageId: randomUUID(),
    taskId,
    contextId,
    role: 2,
    parts: [dataPart(value)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }) as Message

// Runs the same evaluation the native endpoint runs; the result travels as an artifact.
export function evaluationExecutor(
  evaluate: (request: BranchEvaluationRequest) => Promise<BranchEvaluationResult>,
): AgentExecutor {
  return {
    execute: async (requestContext, eventBus) => {
      const { taskId, contextId, userMessage } = requestContext
      const parsed = BranchEvaluationRequest.safeParse(readMessageData(userMessage))
      const task: Task = {
        id: taskId,
        contextId,
        status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: '' },
        artifacts: [],
        history: [userMessage],
        metadata: parsed.success
          ? { caseId: parsed.data.caseId, caseRevision: parsed.data.caseRevision }
          : undefined,
      } as Task
      eventBus.publish(AgentEvent.task(task))
      if (!parsed.success) {
        eventBus.publish(
          statusUpdate(
            taskId,
            contextId,
            TaskState.TASK_STATE_REJECTED,
            agentMessage(taskId, contextId, { error: 'BAD_REQUEST', issues: parsed.error.issues }),
          ),
        )
        eventBus.finished()
        return
      }
      try {
        const result = await evaluate(parsed.data)
        eventBus.publish(
          AgentEvent.artifactUpdate({
            taskId,
            contextId,
            artifact: {
              artifactId: randomUUID(),
              name: evaluationArtifactName,
              description: 'Rule results for this revision',
              parts: [dataPart(result)],
              metadata: undefined,
              extensions: [],
            },
            append: false,
            lastChunk: true,
            metadata: undefined,
          } as never),
        )
        eventBus.publish(statusUpdate(taskId, contextId, TaskState.TASK_STATE_COMPLETED))
      } catch (error) {
        eventBus.publish(
          statusUpdate(
            taskId,
            contextId,
            TaskState.TASK_STATE_FAILED,
            agentMessage(taskId, contextId, { error: 'INTERNAL', message: String(error) }),
          ),
        )
      }
      eventBus.finished()
    },
    cancelTask: async () => {},
  }
}

// A2A has no request deduplication (M0): a resent message would start a second task. A message
// id seen before returns the task it created instead, so a client retry never evaluates twice.
function deduplicating(
  handler: A2ARequestHandler,
  store: SqliteTaskStore,
  card: () => AgentCard,
): A2ARequestHandler {
  return new Proxy(handler, {
    get(target, property, receiver) {
      if (property === 'getAgentCard') return async () => card()
      if (property !== 'sendMessage') return Reflect.get(target, property, receiver)
      return async (...args: Parameters<A2ARequestHandler['sendMessage']>) => {
        const [params, context] = args
        const message = params.message
        const knownTaskId = message && !message.taskId && store.taskIdForMessage(message.messageId)
        if (knownTaskId) {
          const known = await store.load(knownTaskId)
          if (known) return known
        }
        const result = await target.sendMessage(params, context)
        if (message && 'status' in result) store.recordMessage(message.messageId, result.id)
        return result
      }
    },
  })
}

export function mountA2a(
  app: Express,
  // A function when the public URL is only known once the server listens.
  options: {
    card: AgentCard | (() => AgentCard)
    executor: AgentExecutor
    database: StoreDatabase
  },
): void {
  const card = typeof options.card === 'function' ? options.card : () => options.card as AgentCard
  const store = new SqliteTaskStore(options.database)
  const handler = deduplicating(
    new DefaultRequestHandler(card(), store, options.executor),
    store,
    card,
  )
  app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: handler }))
  app.use(
    a2aJsonRpcPath,
    jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }),
  )
}
