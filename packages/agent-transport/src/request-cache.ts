import type { AgentClient } from '@durable-jev/agent-core'

interface CompletedRequest {
  caseId?: string
  taskId: string
  result: unknown
}

const caches = new WeakMap<AgentClient, Map<string, CompletedRequest>>()

export function requestCache(client: AgentClient): Map<string, CompletedRequest> {
  const existing = caches.get(client)
  if (existing) return existing
  const created = new Map<string, CompletedRequest>()
  caches.set(client, created)
  return created
}

export function forgetRequests(client: AgentClient, caseId?: string): void {
  const cache = caches.get(client)
  if (!cache) return
  if (caseId === undefined) {
    cache.clear()
    return
  }
  for (const [key, entry] of cache) {
    if (entry.caseId === caseId) cache.delete(key)
  }
}
