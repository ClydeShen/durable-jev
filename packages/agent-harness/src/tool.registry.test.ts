import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from './tool.registry.js'
import { defineTool, type ToolContext } from './tool.types.js'

const context: ToolContext = {
  runId: 'run-1',
  caseId: 'CASE-1',
  caseRevision: 1,
  operationIdFor: (action) => `CASE-1:r1:${action}`,
}

const getVehicle = defineTool({
  name: 'get_vehicle',
  description: 'Read a vehicle',
  access: 'read',
  replayPolicy: 'replaySafe',
  allowedCallers: ['agent', 'system'],
  inputSchema: z.object({ vehicleId: z.string().min(1) }),
  execute: async ({ vehicleId }) => ({ vehicleId, refrigerated: true }),
})

const applyPlanChange = defineTool({
  name: 'apply_plan_change',
  description: 'Apply a confirmed plan change',
  access: 'write',
  replayPolicy: 'verifyByOperationId',
  allowedCallers: ['system'],
  inputSchema: z.object({ legId: z.string() }),
  execute: async (_input, toolContext) => ({ operationId: toolContext.operationIdFor('apply') }),
})

const registry = () => new ToolRegistry().register(getVehicle).register(applyPlanChange)

describe('ToolRegistry', () => {
  it('only shows the agent the tools it may call', () => {
    expect(
      registry()
        .toolsFor('agent')
        .map((tool) => tool.name),
    ).toEqual(['get_vehicle'])
    expect(registry().toolsFor('system')).toHaveLength(2)
  })

  it('refuses a tool the caller may not use, even if the model names it', async () => {
    const result = await registry().call('apply_plan_change', { legId: 'L1' }, 'agent', context)
    expect(result).toMatchObject({ ok: false, error: { code: 'CALLER_NOT_ALLOWED' } })
  })

  it('refuses unknown tools and invalid input', async () => {
    expect(await registry().call('approve_compliance', {}, 'agent', context)).toMatchObject({
      ok: false,
      error: { code: 'TOOL_NOT_FOUND' },
    })
    expect(await registry().call('get_vehicle', { vehicleId: '' }, 'agent', context)).toMatchObject(
      { ok: false, error: { code: 'INVALID_INPUT' } },
    )
  })

  it('runs an allowed call and gives writes a service-derived operation id', async () => {
    expect(await registry().call('get_vehicle', { vehicleId: 'V1' }, 'agent', context)).toEqual({
      ok: true,
      output: { vehicleId: 'V1', refrigerated: true },
    })
    expect(await registry().call('apply_plan_change', { legId: 'L1' }, 'system', context)).toEqual({
      ok: true,
      output: { operationId: 'CASE-1:r1:apply' },
    })
  })

  it('reports a failing tool as a result instead of throwing', async () => {
    const broken = defineTool({
      ...getVehicle,
      name: 'broken',
      execute: async () => {
        throw new Error('database locked')
      },
    })
    const result = await new ToolRegistry()
      .register(broken)
      .call('broken', { vehicleId: 'V' }, 'agent', context)
    expect(result).toEqual({
      ok: false,
      error: { code: 'EXECUTION_FAILED', message: 'database locked' },
    })
  })

  it('rejects duplicate names and replay-safe writes', () => {
    expect(() => registry().register(getVehicle)).toThrow(/already registered/)
    expect(() => defineTool({ ...applyPlanChange, replayPolicy: 'replaySafe' })).toThrow(
      /cannot be replay safe/,
    )
  })
})
