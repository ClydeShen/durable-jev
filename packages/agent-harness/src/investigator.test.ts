import { Type } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { DurableInvestigator, type ToolCallRecord } from './investigator.js'
import { defineInvestigationTool } from './tools.js'

const lookup = defineInvestigationTool({
  name: 'lookup',
  description: 'Look up a value for the case',
  parameters: Type.Object({ key: Type.String() }),
  execute: (args, scope: string) => ({ scope, key: args.key, value: 42 }),
})

async function investigator(next: Parameters<typeof DurableInvestigator.open>[0]['model']) {
  const calls: ToolCallRecord<string>[] = []
  const opened = await DurableInvestigator.open<string>({
    storage: 'memory',
    instructions: 'Investigate the case.',
    tools: [lookup],
    scopeOf: () => 'CASE-1',
    model: next,
    budget: { maxToolCalls: 2 },
    onToolCall: (record) => calls.push(record),
  })
  return { opened, calls }
}

describe('DurableInvestigator', () => {
  it('runs tools in the investigation scope and returns the final answer', async () => {
    const { opened, calls } = await investigator({
      kind: 'scripted',
      next: (results) =>
        results.length === 0
          ? { call: 'lookup', args: { key: 'weight' } }
          : { answer: `found ${JSON.stringify(results[0]?.result)}` },
    })
    const conversation = await opened.begin()
    const outcome = await opened.run(conversation, 'req-1', 'Find the weight', { caseId: 'CASE-1' })
    expect(outcome).toEqual({
      status: 'finished',
      answer: 'found {"scope":"CASE-1","key":"weight","value":42}',
    })
    expect(calls.map((call) => call.tool)).toEqual(['lookup'])
    await opened.close()
  })

  it('blocks tool calls beyond the budget', async () => {
    const { opened, calls } = await investigator({
      kind: 'scripted',
      next: (results) =>
        typeof results.at(-1)?.result === 'string'
          ? { answer: 'stopped' }
          : { call: 'lookup', args: { key: `k${results.length}` } },
    })
    const outcome = await opened.run(await opened.begin(), 'req-2', 'Loop', {})
    expect(outcome).toEqual({ status: 'finished', answer: 'stopped' })
    expect(calls.map((call) => call.blocked === undefined)).toEqual([true, true, false])
    await opened.close()
  })
})
