import { randomUUID } from 'node:crypto'
import type { AgentCard, Message, Part, Task } from '@a2a-js/sdk'
import { ClientFactory } from '@a2a-js/sdk/client'
import {
  AgentEvent,
  type AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
  type RequestContext,
} from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import express from 'express'

const port = 4810
const baseUrl = `http://localhost:${port}`
const TASK_STATE_WORKING = 2
const TASK_STATE_COMPLETED = 3
const TASK_STATE_INPUT_REQUIRED = 6
const ROLE_USER = 1
const ROLE_AGENT = 2

const cargoAssuranceCard: AgentCard = {
  name: 'Cargo Assurance',
  description: 'Verifies cargo classification, packaging and documents for a shipment revision',
  version: '0.0.0',
  supportedInterfaces: [
    {
      url: `${baseUrl}/a2a/jsonrpc`,
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
      id: 'verify-cargo',
      name: 'Verify cargo',
      description: 'Run cargo checks for one shipment revision',
      tags: ['logistics'],
      examples: [],
      inputModes: ['application/json'],
      outputModes: ['application/json'],
      securityRequirements: [],
    },
  ],
  signatures: [],
}

function dataPart(value: unknown): Part {
  return {
    content: { $case: 'data', value },
    metadata: undefined,
    filename: '',
    mediaType: 'application/json',
  }
}

function readDataParts(message: Message): Record<string, unknown> {
  return Object.assign(
    {},
    ...message.parts.flatMap((part) =>
      part.content?.$case === 'data' ? [part.content.value] : [],
    ),
  )
}

function agentMessage(taskId: string, contextId: string, value: unknown): Message {
  return {
    messageId: randomUUID(),
    taskId,
    contextId,
    role: ROLE_AGENT,
    parts: [dataPart(value)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }
}

const executionsByMessageId = new Map<string, number>()

const cargoAssuranceExecutor: AgentExecutor = {
  execute: async (requestContext: RequestContext, eventBus) => {
    const { taskId, contextId, userMessage } = requestContext
    executionsByMessageId.set(
      userMessage.messageId,
      (executionsByMessageId.get(userMessage.messageId) ?? 0) + 1,
    )
    const accumulatedInput = {
      ...Object.assign({}, ...(requestContext.task?.history ?? []).map(readDataParts)),
      ...readDataParts(userMessage),
    }
    const task: Task = requestContext.task ?? {
      id: taskId,
      contextId,
      status: {
        state: TASK_STATE_WORKING,
        message: undefined,
        timestamp: new Date().toISOString(),
      },
      artifacts: [],
      history: [userMessage],
      metadata: { caseId: accumulatedInput.caseId, caseRevision: accumulatedInput.caseRevision },
    }
    eventBus.publish(AgentEvent.task(task))

    if (accumulatedInput.packingList === undefined) {
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: {
            state: TASK_STATE_INPUT_REQUIRED,
            message: agentMessage(taskId, contextId, { missing: ['packingList'] }),
            timestamp: new Date().toISOString(),
          },
          metadata: undefined,
        }),
      )
      eventBus.finished()
      return
    }

    eventBus.publish(
      AgentEvent.artifactUpdate({
        taskId,
        contextId,
        artifact: {
          artifactId: randomUUID(),
          name: 'cargo-checks',
          description: 'Structured business checks',
          parts: [dataPart({ checks: [{ ruleId: 'R01', gateStatus: 'PASS' }] })],
          metadata: undefined,
          extensions: [],
        },
        append: false,
        lastChunk: true,
        metadata: undefined,
      } as never),
    )
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TASK_STATE_COMPLETED,
          message: undefined,
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      }),
    )
    eventBus.finished()
  },
  cancelTask: async () => {},
}

const requestHandler = new DefaultRequestHandler(
  cargoAssuranceCard,
  new InMemoryTaskStore(),
  cargoAssuranceExecutor,
)
const app = express()
app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: requestHandler }))
app.use(
  '/a2a/jsonrpc',
  jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }),
)
const server = app.listen(port)

function userMessage(messageId: string, value: unknown, taskId = '', contextId = ''): Message {
  return {
    messageId,
    taskId,
    contextId,
    role: ROLE_USER,
    parts: [dataPart(value)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }
}

function sendRequest(message: Message) {
  return { tenant: '', message, configuration: undefined, metadata: undefined }
}

function summarize(result: unknown) {
  const task = (result as { task?: Task }).task ?? (result as Task)
  return {
    id: task.id,
    state: task.status?.state,
    statusData: task.status?.message ? readDataParts(task.status.message) : undefined,
    artifacts: task.artifacts?.map((artifact) => artifact.parts.map((part) => part.content)),
  }
}

try {
  const client = await new ClientFactory().createFromUrl(baseUrl)
  console.log('discovered card:', (await client.getAgentCard()).name)

  const firstMessageId = 'case-1:r1:verify-cargo'
  const first = await client.sendMessage(
    sendRequest(userMessage(firstMessageId, { caseId: 'case-1', caseRevision: 1 })),
  )
  const firstTask = summarize(first)
  console.log('first send:', JSON.stringify(firstTask))

  const retried = await client.sendMessage(
    sendRequest(userMessage(firstMessageId, { caseId: 'case-1', caseRevision: 1 })),
  )
  console.log('retry with same messageId:', JSON.stringify(summarize(retried)))

  const fetched = await client.getTask({
    tenant: '',
    id: firstTask.id,
    historyLength: undefined,
  } as never)
  console.log('getTask:', JSON.stringify(summarize(fetched)))

  const contextId = (first as { task?: Task }).task?.contextId ?? (first as Task).contextId
  const followUp = await client.sendMessage(
    sendRequest(userMessage(randomUUID(), { packingList: 'PL-77' }, firstTask.id, contextId)),
  )
  console.log('after providing input:', JSON.stringify(summarize(followUp)))
  console.log(
    'executions per messageId:',
    JSON.stringify(Object.fromEntries(executionsByMessageId)),
  )
} finally {
  server.close()
}
