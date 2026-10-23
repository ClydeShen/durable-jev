import type {
  CheckStatus,
  HumanTask,
  OrderOptions,
  OrderStatus,
  Role,
  RuleEngineKind,
  Shipment,
} from '@durable-jev/contracts'
import type { RuleDefinition, RuleOutcome, SemanticRule } from '@durable-jev/rule-engine'
import { refusalMessages } from './labels'

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
  revisions: { index: number; label: string; changes: string[]; applied: boolean }[]
  incidents: { index: number; label: string }[]
  investigations: Investigation[]
}

export interface Investigation {
  investigationId: string
  caseRevision: number
  incident: { type: string; legId: string }
  status: 'RUNNING' | 'PROPOSED' | 'ESCALATED' | 'CONFIRMED' | 'REJECTED' | 'STALE'
  proposal?: {
    legId: string
    offerId: string
    carrierId: string
    vehicleId: string
    plannedDeparture: string
    plannedArrival: string
    extraCostCents: number
    rationale: string
    checks: { ruleId: string; title: string; scope: string; status: CheckStatus }[]
  }
  escalation?: string
  decidedBy?: { id: string; role: Role; at: string }
}

export interface RuleInfo {
  ruleId: string
  title: string
  owner: string
  scope: 'order' | 'cargoItem' | 'leg'
  dependsOn: string[]
  kind: RuleEngineKind
  /** Selected per order by destination, customer or commodity group. */
  extension: boolean
  /** The policy text that defines the rule. */
  clause?: { section: string; paragraphs: string[] }
  definition: RuleCheck
  /** The policy parameters the rule reads, with their values. */
  parameters: Record<string, string | number | boolean>
}

/** How a rule is checked, as the rule definition states it. */
export type RuleCheck = Pick<
  RuleDefinition,
  | 'appliesWhen'
  | 'applicability'
  | 'expression'
  | 'humanGate'
  | 'combiner'
  | 'mixing'
  | 'unknownPolicy'
  | 'invalidationTriggers'
> & { semantic?: Pick<SemanticRule, 'question' | 'passWhen'> }

export type AgentNames = Readonly<Record<string, string>>

export interface AgentStatus {
  agentId: string
  available: boolean
  summary?: {
    rulePackVersion: string
    rulesByKind: Partial<Record<RuleEngineKind, number>>
    cases: number
    openTasksByRole: Partial<Record<Role, number>>
  }
  card?: { name: string; description: string; url: string }
  responsibilities: string[]
  transport: 'native' | 'a2a'
  a2aTasks: number
}

/** The policy document the rules were authored from, as written. */
export interface PolicyText {
  version: string
  title: string
  preamble: string[]
  sections: { heading: string; level: 2 | 3; paragraphs: string[] }[]
}

/** The A2A Agent Card an agent publishes at /.well-known/agent-card.json (the parts shown). */
export interface A2aAgentCard {
  name: string
  description: string
  version: string
  supportedInterfaces: { url: string; protocolBinding: string; protocolVersion: string }[]
  capabilities: { streaming?: boolean; pushNotifications?: boolean }
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: { id: string; name: string; description: string; tags: string[] }[]
}

export interface TimelineEntry {
  eventId: string
  agentId: string
  eventName: string
  payload: Record<string, unknown>
  createdAt: string
}

/** The new-order form: sample orders to start from and the reference choices. */
export interface OrderForm {
  samples: { sampleId: string; story: string; shipment: Shipment }[]
  options: OrderOptions
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
  if (!response.ok) {
    throw new Error(
      refusalMessages[body.reason] ?? body.message ?? body.error ?? response.statusText,
    )
  }
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
  reportIncident: (caseId: string, index: number) =>
    request<unknown>(`/cases/${encodeURIComponent(caseId)}/incidents/${index}`, {
      method: 'POST',
    }),
  decideProposal: (investigationId: string, type: 'confirm' | 'reject', actor: Actor) =>
    request<CaseSummary>(`/investigations/${encodeURIComponent(investigationId)}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...asActor(actor) },
      body: JSON.stringify({ type }),
    }),
  orderForm: () => request<OrderForm>('/order-form'),
  submitOrder: (sampleId: string, shipment: Shipment) =>
    request<CaseSummary>('/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sampleId, shipment }),
    }),
  timeline: (caseId: string) =>
    request<TimelineEntry[]>(`/cases/${encodeURIComponent(caseId)}/timeline`),
  agents: () => request<AgentStatus[]>('/agents'),
  policy: () => request<PolicyText>('/policy'),
  agentCard: (agentId: string) => request<A2aAgentCard>(`/agents/${agentId}/card`),
  controlService: (name: string, verb: 'crash' | 'start') =>
    request<unknown>(`/demo/services/${name}/${verb}`, { method: 'POST' }),
  reset: () => request<{ cases: number }>('/demo/reset', { method: 'POST' }),
  resetCase: (caseId: string) =>
    request<CaseSummary>(`/cases/${encodeURIComponent(caseId)}/reset`, { method: 'POST' }),
}
