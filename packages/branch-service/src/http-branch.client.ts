import {
  type BranchEvaluationRequest,
  BranchEvaluationResult,
  type RuleBranch,
} from '@durable-jev/contracts'

import { fetchWithTrace } from '@durable-jev/telemetry'

export class BranchUnavailableError extends Error {
  constructor(
    readonly evaluatorName: string,
    reason: string,
  ) {
    super(`${evaluatorName} is unavailable: ${reason}`)
  }
}

export type RemoteBranchEvaluator = {
  name: string
  branches: readonly RuleBranch[]
  evaluate(request: BranchEvaluationRequest): Promise<BranchEvaluationResult>
}

export function httpBranchEvaluator(
  name: string,
  branches: readonly RuleBranch[],
  baseUrl: string,
  timeoutMs = 10_000,
): RemoteBranchEvaluator {
  return {
    name,
    branches,
    async evaluate(request) {
      let response: Response
      try {
        response = await fetchWithTrace(new URL('/evaluations', baseUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        throw new BranchUnavailableError(name, String(error))
      }
      if (!response.ok) {
        throw new BranchUnavailableError(name, `HTTP ${response.status} ${await response.text()}`)
      }
      return BranchEvaluationResult.parse(await response.json())
    },
  }
}
