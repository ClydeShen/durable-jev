import { randomUUID } from 'node:crypto'
import { type Message, Role, type Task, TaskState } from '@a2a-js/sdk'
import { type Client, ClientFactory } from '@a2a-js/sdk/client'
import type { AgentCaseState, AgentClient } from '@durable-jev/agent-core'
import type { AgentId, HumanTask, Shipment } from '@durable-jev/contracts'
import type { Decision, HumanAction } from '@durable-jev/human-tasks'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import {
  type CaseSkill,
  caseSkills,
  dataOf,
  dataPart,
  type SkillRequest,
  textOf,
} from './skills.js'

/** The operational plane (event pull, demo reset) stays on the agent's native interface. */
export type AgentOperations = Pick<AgentClient, 'events' | 'acknowledgeEvents' | 'reset'>

export interface A2aTaskRecord {
  agentId: AgentId
  skill: CaseSkill
  taskId: string
  state: string
  duplicateOf?: string
}

class A2aCallError extends Error {
  constructor(agentId: AgentId, skill: CaseSkill, detail: string) {
    super(`${agentId} ${skill} over A2A failed: ${detail}`)
    this.name = 'A2aCallError'
  }
}

function userMessage(request: SkillRequest): Message {
  return {
    messageId: randomUUID(),
    taskId: '',
    contextId: '',
    role: Role.ROLE_USER,
    parts: [dataPart(request)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }
}

/**
 * Calls an agent's business capabilities over A2A. The Agent Card is discovered on first use and
 * must list every case skill; each call becomes one A2A Task whose artifact carries the result.
 */
export class A2aAgentClient implements AgentClient {
  private client?: Client

  constructor(
    readonly agentId: AgentId,
    private readonly baseUrl: string,
    private readonly operations: AgentOperations,
    private readonly onTask: (record: A2aTaskRecord) => void = () => {},
  ) {}

  submit(shipment: Shipment) {
    return this.call<AgentCaseState>(
      'submit-case',
      shipment,
      `${shipment.caseId}:r${shipment.caseRevision}`,
    )
  }

  evaluate(caseId: string, foreign: readonly RuleOutcome[]) {
    return this.call<AgentCaseState>('evaluate-case', { caseId, foreign })
  }

  state(caseId: string) {
    return this.call<AgentCaseState>('case-state', { caseId })
  }

  decide(humanTaskId: string, action: HumanAction) {
    return this.call<Decision>('decide-task', { humanTaskId, action })
  }

  openTasks() {
    return this.call<HumanTask[]>('open-tasks', {})
  }

  events() {
    return this.operations.events()
  }

  acknowledgeEvents(eventIds: readonly string[]) {
    return this.operations.acknowledgeEvents(eventIds)
  }

  reset() {
    return this.operations.reset()
  }

  private async discovered(): Promise<Client> {
    if (this.client) return this.client
    const client = await new ClientFactory().createFromUrl(this.baseUrl)
    const offered = new Set((await client.getAgentCard()).skills.map((skill) => skill.id))
    const missing = Object.keys(caseSkills).filter((skill) => !offered.has(skill))
    if (missing.length > 0) {
      throw new Error(`${this.agentId} Agent Card lacks skills: ${missing.join(', ')}`)
    }
    this.client = client
    return client
  }

  private async call<T>(skill: CaseSkill, input: unknown, requestKey?: string): Promise<T> {
    const client = await this.discovered().catch((error: unknown) => {
      throw new A2aCallError(this.agentId, skill, `discovery failed: ${String(error)}`)
    })
    const response = await client
      .sendMessage({
        tenant: '',
        message: userMessage({ skill, requestKey, input }),
        configuration: undefined,
        metadata: undefined,
      })
      .catch((error: unknown) => {
        this.client = undefined
        throw new A2aCallError(this.agentId, skill, String(error))
      })
    const task = response as Task
    const state = task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED
    this.onTask({
      agentId: this.agentId,
      skill,
      taskId: task.id,
      state: TaskState[state] ?? String(state),
      duplicateOf: task.metadata?.duplicateOf,
    })
    if (state !== TaskState.TASK_STATE_COMPLETED) {
      throw new A2aCallError(this.agentId, skill, textOf(task.status?.message) || TaskState[state])
    }
    return dataOf(task.artifacts[0]?.parts ?? []) as T
  }
}
