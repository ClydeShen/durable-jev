import type { ZodType } from 'zod'

export type ToolCaller = 'agent' | 'system'

export type ToolContext = {
  runId: string
  caseId: string
  caseRevision: number
  // Derived by the service from the run and the logical action, never chosen by the model,
  // so a retried or resumed write lands on the same business-side unique key.
  operationIdFor(logicalActionId: string): string
}

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'CALLER_NOT_ALLOWED'
  | 'INVALID_INPUT'
  | 'BUDGET_EXCEEDED'
  | 'EXECUTION_FAILED'

export type ToolResult =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: ToolErrorCode; message: string } }

export type ToolDefinition<Input = unknown> = {
  name: string
  description: string
  access: 'read' | 'write'
  replayPolicy: 'replaySafe' | 'verifyByOperationId'
  allowedCallers: readonly ToolCaller[]
  inputSchema: ZodType<Input>
  execute(input: Input, context: ToolContext): Promise<unknown>
}

export const defineTool = <Input>(definition: ToolDefinition<Input>): ToolDefinition<Input> => {
  if (definition.access === 'write' && definition.replayPolicy === 'replaySafe') {
    throw new Error(`${definition.name} writes, so it cannot be replay safe`)
  }
  return definition
}
