import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Type } from '@earendil-works/pi-ai'
import { describe, expect, it, vi } from 'vitest'
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

describe('DurableInvestigator after a restart', () => {
  it('continues the same run from its checkpoint without repeating finished tools', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'investigator-'))
    const storage = join(directory, 'harness.sqlite')
    const executed: string[] = []
    let hang = true
    const tools = [
      defineInvestigationTool({
        name: 'step',
        description: 'Do one step',
        parameters: Type.Object({ n: Type.Number() }),
        execute: async (args, _scope: string) => {
          executed.push(`step ${args.n}`)
          if (args.n === 2 && hang) await new Promise(() => {})
          return { n: args.n }
        },
      }),
    ]
    const options = {
      storage,
      instructions: 'Do two steps.',
      tools,
      scopeOf: () => 'CASE-1',
      model: {
        kind: 'scripted' as const,
        next: (results: readonly { tool: string }[]) =>
          results.length < 2
            ? { call: 'step', args: { n: results.length + 1 } }
            : { answer: 'done' },
      },
    }
    const first = await DurableInvestigator.open<string>(options)
    const conversation = await first.begin()
    void first.run(conversation, 'req-crash', 'Go', {})
    await vi.waitFor(() => expect(executed).toEqual(['step 1', 'step 2']))
    // Simulates the crash: the first harness is abandoned while step 2 is in flight.
    hang = false
    const second = await DurableInvestigator.open<string>(options)
    const outcome = await second.run(conversation, 'req-crash', 'Go', {})
    expect(outcome).toEqual({ status: 'finished', answer: 'done' })
    expect(executed).toEqual(['step 1', 'step 2', 'step 2'])
    await second.close()
    try {
      rmSync(directory, { recursive: true, force: true })
    } catch (error) {
      // The abandoned harness keeps the SQLite file open, as a real crash would not; Windows
      // refuses to delete an open file, so the temporary folder is left for the OS to clear.
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    }
  })
})
