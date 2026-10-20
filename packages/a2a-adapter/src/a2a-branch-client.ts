import { createHash } from 'node:crypto'
import { type Message, type Task, TaskState } from '@a2a-js/sdk'
import { type Client, ClientFactory } from '@a2a-js/sdk/client'
import {
  type BranchEvaluationRequest,
  BranchEvaluationResult,
  type RuleBranch,
} from '@durable-jev/contracts'
import { evaluationArtifactName } from './a2a-server.js'
import { dataPart, readData } from './parts.js'
import type { A2aTaskLinks, TaskLink } from './task-links.js'

export class A2aCallError extends Error {
  constructor(
    readonly capability: string,
    reason: string,
  ) {
    super(`${capability} over A2A: ${reason}`)
  }
}

const failedStates = new Set([
  TaskState.TASK_STATE_FAILED,
  TaskState.TASK_STATE_CANCELED,
  TaskState.TASK_STATE_REJECTED,
])

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, what: string) =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${timeoutMs} ms`)), timeoutMs),
    ),
  ])

const asTask = (result: unknown): Task | undefined => {
  const candidate = (result as { task?: Task }).task ?? (result as Task)
  return candidate && 'status' in candidate ? candidate : undefined
}

export function a2aBranchEvaluator(
  name: string,
  branches: readonly RuleBranch[],
  baseUrl: string,
  links: A2aTaskLinks,
  timeoutMs = 10_000,
) {
  let client: Promise<Client> | undefined
  const connect = () => {
    client ??= new ClientFactory().createFromUrl(baseUrl).catch((error) => {
      client = undefined
      throw error
    })
    return client
  }
  const call = async <T>(what: string, action: (connected: Client) => Promise<T>) => {
    try {
      return await withTimeout(connect().then(action), timeoutMs, what)
    } catch (error) {
      throw new A2aCallError(name, error instanceof Error ? error.message : String(error))
    }
  }

  const send = async (link: TaskLink, request: BranchEvaluationRequest) => {
    // Recorded before sending: if the response is lost, the same message id is sent again
    // and the server returns the task it already created.
    links.save(link)
    const message = {
      messageId: link.messageId,
      taskId: '',
      contextId: '',
      role: 1,
      parts: [dataPart(request)],
      metadata: undefined,
      extensions: [],
      referenceTaskIds: link.previousTaskIds.slice(-1),
    } as Message
    const result = await call('sendMessage', (connected) =>
      connected.sendMessage({ tenant: '', message, configuration: undefined, metadata: undefined }),
    )
    const task = asTask(result)
    if (!task) throw new A2aCallError(name, 'the service answered without a task')
    return task
  }

  const resultOf = (task: Task, link: TaskLink): BranchEvaluationResult => {
    links.save({ ...link, a2aTaskId: task.id, state: TaskState[task.status?.state ?? 0] ?? '' })
    if (task.status?.state !== TaskState.TASK_STATE_COMPLETED) {
      const detail = task.status?.message ? JSON.stringify(readData(task.status.message.parts)) : ''
      throw new A2aCallError(
        name,
        `task ${task.id} ended as ${TaskState[task.status?.state ?? 0]} ${detail}`,
      )
    }
    const artifact = task.artifacts.find((candidate) => candidate.name === evaluationArtifactName)
    if (!artifact) throw new A2aCallError(name, `task ${task.id} has no ${evaluationArtifactName}`)
    return BranchEvaluationResult.parse(readData(artifact.parts))
  }

  return {
    name,
    branches,
    async evaluate(request: BranchEvaluationRequest): Promise<BranchEvaluationResult> {
      const requestKey = createHash('sha256')
        .update(JSON.stringify({ capability: name, request }))
        .digest('hex')
      const existing = links.find(requestKey)
      const link: TaskLink = existing ?? {
        requestKey,
        caseId: request.caseId,
        caseRevision: request.caseRevision,
        capability: name,
        messageId: `${request.caseId}:r${request.caseRevision}:${name}:${requestKey.slice(0, 16)}`,
        state: 'SENDING',
        previousTaskIds: [],
      }
      if (existing?.a2aTaskId) {
        const known = await call('getTask', (connected) =>
          connected.getTask({
            tenant: '',
            id: existing.a2aTaskId,
            historyLength: undefined,
          } as never),
        )
        const knownTask = asTask(known)
        if (knownTask && !failedStates.has(knownTask.status?.state as TaskState)) {
          return resultOf(knownTask, link)
        }
        // A finished task is never continued: a failed one is followed by a new, linked task.
        const previousTaskIds = [...link.previousTaskIds, existing.a2aTaskId]
        const linked: TaskLink = {
          ...link,
          messageId: `${link.messageId.split('#')[0]}#${previousTaskIds.length}`,
          state: 'SENDING',
          previousTaskIds,
        }
        delete linked.a2aTaskId
        return resultOf(await send(linked, request), linked)
      }
      return resultOf(await send(link, request), link)
    },
  }
}
