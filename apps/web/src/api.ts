import type { HumanTask, OrderStatus, Role, RuleEngineKind, Shipment } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'

export interface CaseSummary {
  caseId: string
  story: string
  status: OrderStatus
  caseRevision: number
  waitingOn: Role[]
  updatedAt: string
}

export interface CaseDetail extends CaseSummary {
  shipment: Shipment
  outcomes: RuleOutcome[]
  tasks: HumanTask[]
  revisions: { index: number; label: string; applied: boolean }[]
}

export interface RuleInfo {
  ruleId: string
  title: string
  owner: string
  scope: 'order' | 'cargoItem' | 'leg'
  dependsOn: string[]
  kind: RuleEngineKind
}

export interface AgentStatus {
  agentId: string
  available: boolean
}

export interface TimelineEntry {
  eventId: string
  agentId: string
  eventName: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface Actor {
  id: string
  role: Role
}

export type TaskDecision =
  | { type: 'approve' | 'reject'; comment?: string }
  | { type: 'complete'; fields: Record<string, string>; evidenceRefs: string[] }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? body.error ?? response.statusText)
  return body as T
}

const asActor = (actor: Actor) => ({ 'x-demo-role': actor.role, 'x-demo-user': actor.id })

export const api = {
  cases: () => request<CaseSummary[]>('/cases'),
  caseDetail: (caseId: string) => request<CaseDetail>(`/cases/${encodeURIComponent(caseId)}`),
  rules: () => request<{ ruleSetVersion: string; rules: RuleInfo[] }>('/rules'),
  tasks: (role: Role) => request<HumanTask[]>(`/tasks?role=${role}`),
  decide: (taskId: string, decision: TaskDecision, actor: Actor) =>
    request<unknown>(`/tasks/${encodeURIComponent(taskId)}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...asActor(actor) },
      body: JSON.stringify(decision),
    }),
  dispatch: (caseId: string, actor: Actor) =>
    request<CaseSummary>(`/cases/${encodeURIComponent(caseId)}/dispatch`, {
      method: 'POST',
      headers: asActor(actor),
    }),
  revise: (caseId: string, index: number) =>
    request<CaseSummary>(`/cases/${encodeURIComponent(caseId)}/revisions/${index}`, {
      method: 'POST',
    }),
  timeline: (caseId: string) =>
    request<TimelineEntry[]>(`/cases/${encodeURIComponent(caseId)}/timeline`),
  agents: () => request<AgentStatus[]>('/agents'),
  controlService: (name: string, verb: 'crash' | 'start') =>
    request<unknown>(`/demo/services/${name}/${verb}`, { method: 'POST' }),
  reset: () => request<{ cases: number }>('/demo/reset', { method: 'POST' }),
}
