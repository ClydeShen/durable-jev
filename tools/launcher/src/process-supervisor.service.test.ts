import { describe, expect, it } from 'vitest'
import { ProcessSupervisor } from './process-supervisor.service.js'

const port = 4987
const tinyServer = `require('node:http').createServer((_, res) => res.end('ok')).listen(${port})`

describe('ProcessSupervisor', () => {
  it('starts, kills and restarts a process by name', async () => {
    const supervisor = new ProcessSupervisor(
      [
        {
          name: 'tiny',
          command: process.execPath,
          args: ['-e', tinyServer],
          healthUrl: `http://127.0.0.1:${port}/`,
        },
      ],
      () => {},
    )
    await supervisor.start('tiny')
    const firstPid = supervisor.status()[0]?.pid
    expect(supervisor.status()[0]?.state).toBe('running')

    await supervisor.kill('tiny')
    expect(supervisor.status()[0]?.state).toBe('exited')

    await supervisor.restart('tiny')
    expect(supervisor.status()[0]).toMatchObject({ state: 'running' })
    expect(supervisor.status()[0]?.pid).not.toBe(firstPid)

    await supervisor.stopAll()
    expect(supervisor.status()[0]?.state).toBe('stopped')
  })

  it('refuses to start when another process already answers on its health URL', async () => {
    const definition = {
      name: 'tiny',
      command: process.execPath,
      args: ['-e', tinyServer],
      healthUrl: `http://127.0.0.1:${port}/`,
    }
    const first = new ProcessSupervisor([definition], () => {})
    const second = new ProcessSupervisor([definition], () => {})
    await first.start('tiny')
    await expect(second.start('tiny')).rejects.toThrow(/another instance is running/)
    await first.stopAll()
  })
})
