import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ScriptedAgentModel, type ScriptedTurn } from './agent-model.types.js'
import { ContextAssembler } from './context-assembler.service.js'
import { InMemoryAgentRuntime } from './in-memory-agent.runtime.js'
import { ToolRegistry } from './tool.registry.js'
import { defineTool } from './tool.types.js'

const registry = () =>
  new ToolRegistry()
    .register(
      defineTool({
        name: 'list_carriers',
        description: 'List carriers qualified for a category',
        access: 'read',
        replayPolicy: 'replaySafe',
        allowedCallers: ['agent'],
        inputSchema: z.object({ category: z.string() }),
        execute: async () => ['CAR-SECURA'],
      }),
    )
    .register(
      defineTool({
        name: 'apply_plan_change',
        description: 'Apply a plan change',
        access: 'write',
        replayPolicy: 'verifyByOperationId',
        allowedCallers: ['system'],
        inputSchema: z.object({}),
        execute: async () => 'applied',
      }),
    )
    .register(
      defineTool({
        name: 'submit_investigation_result',
        description: 'Submit a proposal for a person to review',
        access: 'write',
        replayPolicy: 'verifyByOperationId',
        allowedCallers: ['agent'],
        inputSchema: z.object({ proposedCarrierId: z.string() }),
        execute: async (input) => ({ ...input, status: 'PROPOSED' }),
      }),
    )

const call = (name: string, input: unknown, callId = name) => ({
  toolCalls: [{ callId, name, input }],
})

const open = async (turns: ScriptedTurn[], now?: () => number) => {
  const runtime = new InMemoryAgentRuntime<{ caseId: string }>({
    registry: registry(),
    model: new ScriptedAgentModel(turns),
    assembler: new ContextAssembler(['Investigate transport plans.']),
    describe: (input) => ({ task: `Find a carrier for ${input.caseId}`, data: [] }),
    resultTool: 'submit_investigation_result',
    ...(now ? { now } : {}),
  })
  return runtime.open({ caseId: 'LOG-003', caseRevision: 1, purpose: 'carrier' })
}

describe('InMemoryAgentRuntime', () => {
  it('runs an investigation to a submitted proposal', async () => {
    const session = await open([
      call('list_carriers', { category: 'CONTROLLED' }),
      call('submit_investigation_result', { proposedCarrierId: 'CAR-SECURA' }),
    ])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toEqual({
      status: 'completed',
      result: { proposedCarrierId: 'CAR-SECURA', status: 'PROPOSED' },
    })
    expect(session.events().map((event) => event.type)).toEqual([
      'run.started',
      'model.called',
      'tool.called',
      'model.called',
      'tool.called',
      'run.completed',
    ])
  })

  it('refuses a system-only tool the model names and keeps going', async () => {
    const session = await open([
      call('apply_plan_change', {}),
      call('submit_investigation_result', { proposedCarrierId: 'CAR-SECURA' }),
    ])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect((await run.outcome).status).toBe('completed')
    expect(session.events()).toContainEqual({
      type: 'tool.called',
      runId: run.runId,
      tool: 'apply_plan_change',
      ok: false,
      error: 'CALLER_NOT_ALLOWED',
    })
  })

  it('escalates a looping model when the tool budget runs out', async () => {
    const session = await open(
      Array.from({ length: 20 }, (_, turn) =>
        call('list_carriers', { category: 'CONTROLLED' }, `c${turn}`),
      ),
    )
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toMatchObject({ status: 'escalated', reason: 'toolCalls' })
  })

  it('retries a failing model three times, then escalates', async () => {
    const session = await open([
      { fail: 'timeout' },
      { fail: 'timeout' },
      { fail: 'timeout' },
      { fail: 'overloaded' },
    ])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toMatchObject({
      status: 'escalated',
      reason: 'modelRetries',
      detail: expect.stringContaining('overloaded'),
    })
  })

  it('escalates when the model stops without submitting a result', async () => {
    const session = await open([{ toolCalls: [], text: 'The carrier looks fine.' }])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toMatchObject({ status: 'escalated', reason: 'noResult' })
  })

  it('returns the same run for a repeated request id and cannot resume after a crash', async () => {
    const session = await open([
      call('submit_investigation_result', { proposedCarrierId: 'CAR-SECURA' }),
    ])
    const first = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    const again = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(again).toBe(first)
    expect(await session.resume()).toBeUndefined()
  })
})
