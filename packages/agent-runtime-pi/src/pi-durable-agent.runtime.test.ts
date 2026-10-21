import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ContextAssembler,
  defineTool,
  ScriptedAgentModel,
  type ScriptedTurn,
  ToolRegistry,
} from '@durable-jev/agent-harness'
import { openDatabase } from '@durable-jev/store'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PiDurableAgentRuntime } from './pi-durable-agent-runtime.js'
import { piRuntimeMigrations } from './run-store.js'

const registry = () =>
  new ToolRegistry()
    .register(
      defineTool({
        name: 'list_carriers',
        description: 'List carriers',
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
        name: 'submit_result',
        description: 'Submit a proposal',
        access: 'write',
        replayPolicy: 'verifyByOperationId',
        allowedCallers: ['agent'],
        inputSchema: z.object({ carrierId: z.string() }),
        execute: async (input) => ({ ...input, status: 'PROPOSED' }),
      }),
    )

const call = (name: string, input: unknown, callId = name) => ({
  toolCalls: [{ callId, name, input }],
})

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

async function open(turns: ScriptedTurn[]) {
  const directory = mkdtempSync(join(tmpdir(), 'pi-runtime-'))
  directories.push(directory)
  const runtime = new PiDurableAgentRuntime<{ caseId: string }>({
    registry: registry(),
    model: new ScriptedAgentModel(turns),
    assembler: new ContextAssembler(['Investigate transport plans.']),
    describe: (input) => ({ task: `Find a carrier for ${input.caseId}`, data: [] }),
    resultTool: 'submit_result',
    storagePath: join(directory, 'pi.sqlite'),
    stateDatabase: openDatabase(join(directory, 'runs.sqlite'), piRuntimeMigrations),
  })
  return runtime.open({ caseId: 'LOG-003', caseRevision: 1, purpose: 'carrier' })
}

describe('PiDurableAgentRuntime', () => {
  it('runs to a submitted result through Pi', async () => {
    const session = await open([
      call('list_carriers', { category: 'CONTROLLED' }),
      call('submit_result', { carrierId: 'CAR-SECURA' }),
    ])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toEqual({
      status: 'completed',
      result: { carrierId: 'CAR-SECURA', status: 'PROPOSED' },
    })
    await session.close()
  })

  it('never offers a system-only tool to the model', async () => {
    const session = await open([
      call('apply_plan_change', {}),
      call('submit_result', { carrierId: 'CAR-SECURA' }),
    ])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect((await run.outcome).status).toBe('completed')
    const executed = session
      .events()
      .flatMap((event) => (event.type === 'tool.called' ? [event.tool] : []))
    expect(executed).not.toContain('apply_plan_change')
    await session.close()
  })

  it('escalates when the tool budget runs out', async () => {
    const session = await open(
      Array.from({ length: 20 }, (_, turn) =>
        call('list_carriers', { category: 'CONTROLLED' }, `c${turn}`),
      ),
    )
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toMatchObject({ status: 'escalated', reason: 'toolCalls' })
    await session.close()
  })

  it('escalates when the model stops without a result', async () => {
    const session = await open([{ toolCalls: [], text: 'Looks fine to me.' }])
    const run = await session.submit({ requestId: 'req-1', input: { caseId: 'LOG-003' } })
    expect(await run.outcome).toMatchObject({ status: 'escalated', reason: 'noResult' })
    await session.close()
  })

  it('returns the stored outcome for a repeated request id', async () => {
    const session = await open([call('submit_result', { carrierId: 'CAR-SECURA' })])
    const first = await (await session.submit({ requestId: 'req-1', input: { caseId: 'x' } }))
      .outcome
    const again = await (await session.submit({ requestId: 'req-1', input: { caseId: 'x' } }))
      .outcome
    expect(again).toEqual(first)
    expect(await session.resume()).toBeUndefined()
    await session.close()
  })
})
