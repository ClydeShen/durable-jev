import type { DecisionResult, Incident, Investigation } from '@durable-jev/logistics'
import { HttpError } from '@durable-jev/service-kit'

type ConfirmedDecision = Extract<DecisionResult, { ok: true }>

/** Calls the transport planning agent's incident desk. */
export class InvestigationClient {
  constructor(private readonly baseUrl: string) {}

  report(caseId: string, incident: Incident): Promise<Investigation> {
    return this.call('', { method: 'POST', body: { caseId, incident } })
  }

  ofCase(caseId: string): Promise<Investigation[]> {
    return this.call(`?caseId=${encodeURIComponent(caseId)}`)
  }

  decide(
    investigationId: string,
    type: 'confirm' | 'reject',
    actorHeaders: Record<string, string>,
  ): Promise<ConfirmedDecision> {
    return this.call(`/${encodeURIComponent(investigationId)}/decision`, {
      method: 'POST',
      body: { type },
      headers: actorHeaders,
    })
  }

  private async call<T>(
    path: string,
    init?: { method: string; body: unknown; headers?: Record<string, string> },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/agent/investigations${path}`, {
      method: init?.method ?? 'GET',
      headers: init ? { 'content-type': 'application/json', ...init.headers } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
    }).catch((error: unknown) => {
      throw new HttpError(503, `transport-planning is unavailable: ${String(error)}`)
    })
    const body = (await response.json()) as T & { error?: string }
    if (!response.ok) throw new HttpError(response.status, body.error ?? response.statusText)
    return body
  }
}
