import { createServiceApp } from '@durable-jev/service-kit'
import type { Express, Request, Response } from 'express'
import { resetDemo } from './demo-reset.js'
import type { ProcessSupervisor } from './process-supervisor.js'
import { slowableServices } from './service-manifest.js'

type ProcessAction = 'start' | 'stop' | 'restart' | 'kill'
const processActions: readonly ProcessAction[] = ['start', 'stop', 'restart', 'kill']

export function createControlApp(supervisor: ProcessSupervisor): Express {
  const app = createServiceApp('launcher')

  app.get('/processes', (_request, response) => {
    response.json(supervisor.status())
  })

  app.post('/processes/:name/:action', async (request: Request, response: Response) => {
    const { name, action } = request.params as { name: string; action: ProcessAction }
    if (!supervisor.names().includes(name) || !processActions.includes(action)) {
      response.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    await supervisor[action](name)
    response.json(supervisor.status().find((status) => status.name === name))
  })

  // Demo fault: make a branch service answer slowly, so the coordinator times out on it.
  app.post('/faults/:name/delay', async (request: Request, response: Response) => {
    const baseUrl = slowableServices[request.params.name as string]
    if (!baseUrl) {
      response.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    try {
      const forwarded = await fetch(`${baseUrl}/faults/delay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.body ?? {}),
      })
      response.status(forwarded.status).json(await forwarded.json())
    } catch (error) {
      response.status(503).json({ error: 'UNAVAILABLE', message: String(error) })
    }
  })

  app.post('/demo/reset', async (_request, response) => {
    response.json(await resetDemo(supervisor))
  })

  return app
}
