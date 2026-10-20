import type {
  CaseChange,
  CheckResult,
  HumanTask,
  Investigation,
  OrderStatus,
  PlanChange,
  ReferenceData,
  Role,
  Shipment,
} from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'

export type CaseSummary = {
  caseId: string
  correlationId: string
  shipment: Shipment
  orderStatus: OrderStatus
  updatedAt: string
}

export type CaseView = CaseSummary & {
  checks: CheckResult[]
  humanTasks: HumanTask[]
  changes: CaseChange[]
  investigations: Investigation[]
}

export type RuleCatalog = { ruleSetVersion: string; rules: RuleDefinition[] }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string },
  ) {
    super(body.message ?? body.error ?? `HTTP ${status}`)
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { role?: Role; ifMatch?: string } = {},
): Promise<T> {
  const { role, ifMatch, ...rest } = init
  const response = await fetch(path, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(role ? { 'x-demo-role': role } : {}),
      ...(ifMatch ? { 'if-match': ifMatch } : {}),
    },
  })
  const body = await response.json()
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

export const api = {
  listCases: () => request<CaseSummary[]>('/api/cases'),
  getCase: (caseId: string) => request<CaseView>(`/api/cases/${caseId}`),
  listRules: () => request<RuleCatalog>('/api/rules'),
  referenceData: () => request<ReferenceData>('/api/reference-data'),
  applyChange: (caseId: string, change: PlanChange, role: Role, basedOnRevision: number) =>
    request<CaseView>(`/api/cases/${caseId}/changes`, {
      method: 'POST',
      role,
      ifMatch: String(basedOnRevision),
      body: JSON.stringify(change),
    }),
  approve: (humanTaskId: string, role: Role, conditions: string[] = []) =>
    request<HumanTask>(`/api/human-tasks/${humanTaskId}/approve`, {
      method: 'POST',
      role,
      body: JSON.stringify({ conditions }),
    }),
  reject: (humanTaskId: string, role: Role, reason: string) =>
    request<HumanTask>(`/api/human-tasks/${humanTaskId}/reject`, {
      method: 'POST',
      role,
      body: JSON.stringify({ reason }),
    }),
  complete: (humanTaskId: string, role: Role, fields: Record<string, string>) =>
    request<HumanTask>(`/api/human-tasks/${humanTaskId}/complete`, {
      method: 'POST',
      role,
      body: JSON.stringify({ fields }),
    }),
  investigate: (
    caseId: string,
    body: { legId: string; unavailableCarrierIds: string[]; reason: string },
    role: Role,
  ) =>
    request<Investigation>(`/api/cases/${caseId}/investigations`, {
      method: 'POST',
      role,
      body: JSON.stringify(body),
    }),
  acceptInvestigation: (investigationId: string, role: Role) =>
    request<CaseView>(`/api/investigations/${investigationId}/accept`, { method: 'POST', role }),
  rejectInvestigation: (investigationId: string, role: Role, reason: string) =>
    request<Investigation>(`/api/investigations/${investigationId}/reject`, {
      method: 'POST',
      role,
      body: JSON.stringify({ reason }),
    }),
  reevaluate: (caseId: string) =>
    request<CaseView>(`/api/cases/${caseId}/reevaluate`, { method: 'POST' }),
  dispatch: (caseId: string, role: Role) =>
    request<CaseView>(`/api/cases/${caseId}/dispatch`, { method: 'POST', role }),
  resetDemo: () => request<{ loadedCaseIds: string[] }>('/control/demo/reset', { method: 'POST' }),
}
