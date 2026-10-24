import { randomUUID } from 'node:crypto'
import { type AgentCard, Role, type Task, TaskState } from '@a2a-js/sdk'
import {
  AgentEvent,
  type AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import type { AgentClient } from '@durable-jev/agent-core'
import { businessCaseSchema } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { Router } from 'express'
import { z } from 'zod'
import { requestCache } from '../request-cache.js'
import {
  type CaseSkill,
  caseSkills,
  dataOf,
  dataPart,
  type SkillRequest,
  textPart,
} from './skills.js'

const jsonRpcPath = '/a2a/jsonrpc'

export interface AgentProfile {
  name: string
  description: string
}

export function agentCard(profile: AgentProfile, baseUrl: string, version: string): AgentCard {
  return {
    name: profile.name,
    description: profile.description,
    version,
    supportedInterfaces: [
      {
        url: `${baseUrl}${jsonRpcPath}`,
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
    skills: Object.entries(caseSkills).map(([id, { name, description }]) => ({
      id,
      name,
      description,
      tags: ['business-rules'],
      examples: [],
      inputModes: ['application/json'],
      outputModes: ['application/json'],
      securityRequirements: [],
    })),
    signatures: [],
  }
}

const requestSchema = z.object({
  skill: z.enum(Object.keys(caseSkills) as [CaseSkill, ...CaseSkill[]]),
  requestKey: z.string().min(1).optional(),
  input: z.unknown(),
})

const caseIdInput = z.object({ caseId: z.string().min(1) })

function skillHandlers(
  client: AgentClient,
): Record<CaseSkill, (input: unknown) => Promise<unknown>> {
  return {
    'submit-case': (input) => client.submit(businessCaseSchema.parse(input)),
    'evaluate-case': (input) => {
      const { caseId, foreign } = caseIdInput.extend({ foreign: z.array(z.unknown()) }).parse(input)
      return client.evaluate(caseId, foreign as RuleOutcome[])
    },
    'case-state': (input) => client.state(caseIdInput.parse(input).caseId),
    'decide-task': (input) => {
      const { humanTaskId, action } = z
        .object({ humanTaskId: z.string().min(1), action: z.record(z.string(), z.unknown()) })
        .parse(input)
      return client.decide(humanTaskId, action as unknown as HumanAction)
    },
    'open-tasks': () => client.openTasks(),
  }
}

function terminalTask(
  base: Pick<Task, 'id' | 'contextId' | 'history'>,
  request: Partial<SkillRequest>,
  outcome: { result: unknown } | { error: string },
  duplicateOf?: string,
): Task {
  const failed = 'error' in outcome
  return {
    ...base,
    status: {
      state: failed ? TaskState.TASK_STATE_FAILED : TaskState.TASK_STATE_COMPLETED,
      message: failed
        ? {
            messageId: randomUUID(),
            taskId: base.id,
            contextId: base.contextId,
            role: Role.ROLE_AGENT,
            parts: [textPart(outcome.error)],
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
          }
        : undefined,
      timestamp: new Date().toISOString(),
    },
    artifacts: failed
      ? []
      : [
          {
            artifactId: randomUUID(),
            name: request.skill ?? 'result',
            description: request.skill ? caseSkills[request.skill].description : '',
            parts: [dataPart(outcome.result)],
            metadata: undefined,
            extensions: [],
          },
        ],
    metadata: { skill: request.skill, requestKey: request.requestKey, duplicateOf },
  }
}

/**
 * Serves an agent's business capabilities as A2A: an Agent Card for discovery and one A2A Task
 * per request. A retried request with the same `requestKey` returns the first task's result
 * instead of running again.
 */
export function a2aRoutes(client: AgentClient, card: AgentCard): Router {
  const handlers = skillHandlers(client)
  const completedByKey = requestCache(client)
  const executor: AgentExecutor = {
    execute: async (context, bus) => {
      const base = {
        id: context.taskId,
        contextId: context.contextId,
        history: [context.userMessage],
      }
      const parsed = requestSchema.safeParse(dataOf(context.userMessage.parts))
      if (!parsed.success) {
        bus.publish(AgentEvent.task(terminalTask(base, {}, { error: parsed.error.message })))
        bus.finished()
        return
      }
      const request = parsed.data
      const key = request.requestKey && `${request.skill}:${request.requestKey}`
      const earlier = key ? completedByKey.get(key) : undefined
      const result = earlier
        ? { result: earlier.result }
        : await handlers[request.skill](request.input).then(
            (value) => ({ result: value }),
            (error: unknown) => ({ error: String(error) }),
          )
      const task = terminalTask(base, request, result, earlier?.taskId)
      if (key && !earlier && 'result' in result) {
        const input = z.record(z.string(), z.unknown()).safeParse(request.input)
        const caseId =
          input.success && typeof input.data.caseId === 'string' ? input.data.caseId : undefined
        completedByKey.set(key, { caseId, taskId: task.id, result: result.result })
      }
      bus.publish(AgentEvent.task(task))
      bus.finished()
    },
    cancelTask: async () => {},
  }
  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), executor)
  const router = Router()
  router.use(
    '/.well-known/agent-card.json',
    agentCardHandler({ agentCardProvider: requestHandler }),
  )
  router.use(
    jsonRpcPath,
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }),
  )
  return router
}
