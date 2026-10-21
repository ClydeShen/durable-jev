import { describe, expect, it } from 'vitest'
import type { ProcessSupervisor } from './process-supervisor.service.js'
import { createRuntimeModes } from './runtime-modes.service.js'

const fakeSupervisor = () => {
  const calls: string[] = []
  const supervisor = {
    stop: async (name: string) => void calls.push(`stop ${name}`),
    start: async (name: string) => void calls.push(`start ${name}`),
    updateEnv: (name: string, env: Record<string, string>) =>
      void calls.push(`env ${name} ${env.BRANCH_PROTOCOL}/${env.MODEL_MODE}`),
  } as unknown as ProcessSupervisor
  return { supervisor, calls }
}

describe('runtime modes', () => {
  it('restarts only the coordinator when the branch protocol changes', async () => {
    const { supervisor, calls } = fakeSupervisor()
    const modes = createRuntimeModes(supervisor, {})
    expect(await modes.set({ branchProtocol: 'a2a' })).toEqual({ ok: true })
    expect(calls.filter((call) => call.startsWith('stop'))).toEqual(['stop coordinator'])
    expect(calls.filter((call) => call.startsWith('start'))).toEqual(['start coordinator'])
    expect(modes.get().branchProtocol).toBe('a2a')
  })

  it('refuses live mode without an API key and changes nothing', async () => {
    const { supervisor, calls } = fakeSupervisor()
    const modes = createRuntimeModes(supervisor, {})
    const outcome = await modes.set({ modelMode: 'live' })
    expect(outcome.ok).toBe(false)
    expect(calls).toEqual([])
    expect(modes.get()).toMatchObject({ modelMode: 'scripted', liveAvailable: false })
  })

  it('restarts the branch services too when the model mode changes', async () => {
    const { supervisor, calls } = fakeSupervisor()
    const modes = createRuntimeModes(supervisor, { TYPESAFE_API_KEY: 'key' })
    await modes.set({ modelMode: 'live' })
    expect(calls.filter((call) => call.startsWith('start'))).toHaveLength(4)
    expect(modes.get().modelMode).toBe('live')
  })

  it('does nothing when asked for the mode it is already in', async () => {
    const { supervisor, calls } = fakeSupervisor()
    const modes = createRuntimeModes(supervisor, {})
    await modes.set({ branchProtocol: 'native', modelMode: 'scripted' })
    expect(calls).toEqual([])
  })
})
