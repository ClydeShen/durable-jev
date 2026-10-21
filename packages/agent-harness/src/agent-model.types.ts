import type { AssembledContext } from './context-assembler.js'
import type { ToolResult } from './tool.js'

export type ToolCall = { callId: string; name: string; input: unknown }

export type TranscriptEntry =
  | { role: 'model'; toolCalls: readonly ToolCall[]; text?: string }
  | { role: 'tool'; callId: string; name: string; result: ToolResult }

export type ModelTurn = { toolCalls: readonly ToolCall[]; text?: string }

export type ModelRequest = {
  context: AssembledContext
  tools: readonly { name: string; description: string }[]
  transcript: readonly TranscriptEntry[]
}

// A model only proposes the next step. It has no authority: every call goes through the
// registry, and the run's result is whatever the result tool accepted.
export interface AgentModel {
  readonly provider: string
  readonly modelId: string
  next(request: ModelRequest): Promise<ModelTurn>
}

export type ScriptedTurn = ModelTurn | { fail: string }

export class ScriptedAgentModel implements AgentModel {
  readonly provider = 'scripted'
  private position = 0

  constructor(
    private readonly turns: readonly ScriptedTurn[],
    readonly modelId = 'scripted-investigator',
  ) {}

  async next(): Promise<ModelTurn> {
    const turn = this.turns[this.position]
    this.position += 1
    if (!turn) return { toolCalls: [], text: 'No more scripted turns.' }
    if ('fail' in turn) throw new Error(turn.fail)
    return turn
  }
}
