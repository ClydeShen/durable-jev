import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createServiceApp } from './service-app.js'

describe('createServiceApp', () => {
  it('reports health with the service name', async () => {
    const server = createServiceApp('coordinator').listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json()
    server.close()
    expect(health).toMatchObject({ service: 'coordinator', status: 'ok' })
  })
})
