import type { AgentCaseState, AgentClient, AgentSummary } from '@durable-jev/agent-core'
import type { AgentId, BusinessCase, HumanTask } from '@durable-jev/contracts'
import type { Decision, HumanAction } from '@durable-jev/human-tasks'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import type { OutboxEvent } from '@durable-jev/store'

class AgentUnavailableError extends Error {
  constructor(
    readonly agentId: AgentId,
    cause: unknown,
  ) {
    super(`${agentId} is unavailable: ${String(cause)}`, { cause })
    this.name = 'AgentUnavailableError'
  }
}

export class HttpAgentClient implements AgentClient {
  constructor(
    readonly agentId: AgentId,
    private readonly baseUrl: string,
  ) {}

  private async call<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
    const response = await fetch(`${this.baseUrl}/agent${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    }).catch((error: unknown) => {
      throw new AgentUnavailableError(this.agentId, error)
    })
    if (!response.ok)
      throw new AgentUnavailableError(this.agentId, `${response.status} ${await response.text()}`)
    return (await response.json()) as T
  }

  submit(data: BusinessCase): Promise<AgentCaseState> {
    return this.call<AgentCaseState>(`/cases/${encodeURIComponent(data.caseId)}`, {
      method: 'PUT',
      body: data,
    })
  }

  evaluate(caseId: string, foreign: readonly RuleOutcome[]): Promise<AgentCaseState> {
    return this.call<AgentCaseState>(`/cases/${encodeURIComponent(caseId)}/evaluate`, {
      method: 'POST',
      body: { foreign },
    })
  }

  state(caseId: string): Promise<AgentCaseState> {
    return this.call<AgentCaseState>(`/cases/${encodeURIComponent(caseId)}`)
  }

  decide(humanTaskId: string, action: HumanAction): Promise<Decision> {
    return this.call<Decision>(`/tasks/${encodeURIComponent(humanTaskId)}/decision`, {
      method: 'POST',
      body: action,
    })
  }

  openTasks(): Promise<HumanTask[]> {
    return this.call<HumanTask[]>('/tasks')
  }

  events(): Promise<OutboxEvent[]> {
    return this.call<OutboxEvent[]>('/events')
  }

  async acknowledgeEvents(eventIds: readonly string[]): Promise<void> {
    await this.call('/events/ack', { method: 'POST', body: { eventIds } })
  }

  async reset(caseId?: string): Promise<void> {
    await this.call('/reset', { method: 'POST', body: { caseId } })
  }

  summary(): Promise<AgentSummary> {
    return this.call<AgentSummary>('/summary')
  }
}
