import type { ToolCaller, ToolContext, ToolDefinition, ToolResult } from './tool.types.js'

const failure = (code: Extract<ToolResult, { ok: false }>['error']['code'], message: string) =>
  ({ ok: false, error: { code, message } }) as const

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never>>()

  register<Input>(definition: ToolDefinition<Input>): this {
    if (this.tools.has(definition.name)) throw new Error(`${definition.name} is already registered`)
    this.tools.set(definition.name, definition as ToolDefinition<never>)
    return this
  }

  // What a model is shown. Approvals, field actions, plan application and dispatch are never
  // registered for the agent, so the model cannot even name them.
  toolsFor(caller: ToolCaller): ToolDefinition<unknown>[] {
    return [...this.tools.values()].filter((tool) =>
      tool.allowedCallers.includes(caller),
    ) as ToolDefinition<unknown>[]
  }

  get(name: string): ToolDefinition<unknown> | undefined {
    return this.tools.get(name) as ToolDefinition<unknown> | undefined
  }

  async call(
    name: string,
    input: unknown,
    caller: ToolCaller,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name) as ToolDefinition<unknown> | undefined
    if (!tool) return failure('TOOL_NOT_FOUND', `${name} is not a registered tool`)
    if (!tool.allowedCallers.includes(caller)) {
      return failure('CALLER_NOT_ALLOWED', `${name} cannot be called by ${caller}`)
    }
    const parsed = tool.inputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', parsed.error.message)
    try {
      return { ok: true, output: await tool.execute(parsed.data, context) }
    } catch (error) {
      return failure('EXECUTION_FAILED', error instanceof Error ? error.message : String(error))
    }
  }
}
