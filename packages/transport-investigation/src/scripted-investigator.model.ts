import type { AgentModel, ModelRequest, ModelTurn, ToolCall } from '@durable-jev/agent-harness'
import type { CandidateCheck } from './candidate-check.rules.js'
import { resultToolName } from './investigation.tools.js'

type ListedCarrier = { carrierId: string; vehicles: { vehicleId: string }[] }

const maxCandidatesChecked = 6

// Stands in for the generative model until one is configured: list, check, propose the first
// candidate that fits. It goes through exactly the same tools and guards a real model would.
export class ScriptedInvestigatorModel implements AgentModel {
  readonly provider = 'scripted'
  readonly modelId = 'scripted-transport-investigator'

  constructor(private readonly legId: string) {}

  async next({ transcript }: ModelRequest): Promise<ModelTurn> {
    const results = transcript.flatMap((entry) => (entry.role === 'tool' ? [entry] : []))
    const listed = results.find((entry) => entry.name === 'list_candidate_carriers')
    if (!listed) return turn([call('list', 'list_candidate_carriers', { legId: this.legId })])
    if (!listed.result.ok)
      return this.noCandidate(`listing carriers failed: ${listed.result.error.message}`)

    const candidates = (listed.result.output as ListedCarrier[])
      .flatMap((carrier) =>
        carrier.vehicles.map((vehicle) => ({
          legId: this.legId,
          carrierId: carrier.carrierId,
          vehicleId: vehicle.vehicleId,
        })),
      )
      .slice(0, maxCandidatesChecked)
    const checks = results.filter((entry) => entry.name === 'check_candidate')
    if (checks.length === 0) {
      if (candidates.length === 0)
        return this.noCandidate('no other carrier serves both ends of the leg')
      return turn(
        candidates.map((candidate, index) => call(`check-${index}`, 'check_candidate', candidate)),
      )
    }

    const fitting = candidates.find((_candidate, index) => {
      const check = checks.find((entry) => entry.callId === `check-${index}`)
      return check?.result.ok === true && (check.result.output as CandidateCheck).fits
    })
    if (!fitting)
      return this.noCandidate(
        `none of the ${candidates.length} checked vehicles passes every fit rule`,
      )
    return turn([
      call('submit', resultToolName, {
        outcome: 'REPLACEMENT',
        ...fitting,
        rationale: `${fitting.carrierId} with ${fitting.vehicleId} passes capacity, qualification, temperature, service area and equipment checks for ${fitting.legId}.`,
      }),
    ])
  }

  private noCandidate(rationale: string): ModelTurn {
    return turn([
      call('submit', resultToolName, { outcome: 'NO_CANDIDATE', legId: this.legId, rationale }),
    ])
  }
}

const call = (callId: string, name: string, input: unknown): ToolCall => ({ callId, name, input })
const turn = (toolCalls: ToolCall[]): ModelTurn => ({ toolCalls })
