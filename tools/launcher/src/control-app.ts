import { createServiceApp } from '@durable-jev/service-kit'
import type { Express, Request, Response } from 'express'
import { resetDemo } from './demo-reset.js'
import type { ProcessSupervisor } from './process-supervisor.js'

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

  app.post('/demo/reset', async (_request, response) => {
    response.json(await resetDemo(supervisor))
  })

  return app
}
