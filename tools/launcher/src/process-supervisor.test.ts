import { describe, expect, it } from 'vitest'
import { ProcessSupervisor } from './process-supervisor.js'

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
})
