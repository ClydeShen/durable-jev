import type { BudgetLimit } from './run-budget-guard.js'
import type { ToolErrorCode } from './tool.js'

export type SessionKey = { caseId: string; caseRevision: number; purpose: string }

export type AgentEvent =
  | { type: 'run.started'; runId: string }
  | { type: 'run.resumed'; runId: string; restart: number }
  | { type: 'model.called'; runId: string; provider: string; modelId: string }
  | { type: 'tool.called'; runId: string; tool: string; ok: true }
  | { type: 'tool.called'; runId: string; tool: string; ok: false; error: ToolErrorCode }
  | { type: 'run.completed'; runId: string; result: unknown }
  | { type: 'run.escalated'; runId: string; reason: EscalationReason; detail: string }

// Every way a run can end without a result hands the case to a person.
export type EscalationReason = BudgetLimit | 'noResult'

export type RunOutcome =
  | { status: 'completed'; result: unknown }
  | { status: 'escalated'; reason: EscalationReason; detail: string }

export type RunHandle = { runId: string; outcome: Promise<RunOutcome> }

export interface AgentSession<Input> {
  submit(request: { requestId: string; input: Input }): Promise<RunHandle>
  resume(): Promise<RunHandle | undefined>
  events(): readonly AgentEvent[]
  close(): Promise<void>
}

export interface AgentRuntime<Input> {
  open(sessionKey: SessionKey): Promise<AgentSession<Input>>
}
