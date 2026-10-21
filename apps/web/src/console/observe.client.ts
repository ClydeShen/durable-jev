import type { StoredEvent } from '@durable-jev/contracts'
import type { CaseSummary } from './console.model.js'

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`/observe${path}`)
  if (!response.ok) throw new Error(`observability answered ${response.status}`)
  return (await response.json()) as T
}

export type CaseDetail = { summary: CaseSummary; events: StoredEvent[]; latest: number }

export const observeApi = {
  cases: () => get<{ cases: CaseSummary[]; latest: number }>('/cases'),
  caseDetail: (correlationId: string) =>
    get<CaseDetail>(`/cases/${encodeURIComponent(correlationId)}`),
}
