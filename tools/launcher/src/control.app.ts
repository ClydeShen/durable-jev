import { createServiceApp } from '@durable-jev/service-kit'
import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import { resetDemo } from './demo-reset.service.js'
import type { ProcessSupervisor } from './process-supervisor.service.js'
import { createProofRuns, type ProofKind, proofKinds } from './proof-runs.service.js'
import { createRuntimeModes } from './runtime-modes.service.js'
import { slowableServices } from './service.manifest.js'

type ProcessAction = 'start' | 'stop' | 'restart' | 'kill'
const processActions: readonly ProcessAction[] = ['start', 'stop', 'restart', 'kill']

export const createControlApp = (supervisor: ProcessSupervisor): Express => {
  const app = createServiceApp('launcher')
  const modes = createRuntimeModes(supervisor)
  const proofRuns = createProofRuns()

  app.get('/modes', (_request, response) => {
    response.json(modes.get())
  })

  app.post('/modes', async (request: Request, response: Response) => {
    const wanted = z
      .object({
        branchProtocol: z.enum(['native', 'a2a']).optional(),
        modelMode: z.enum(['scripted', 'live']).optional(),
      })
      .safeParse(request.body)
    if (!wanted.success) {
      response.status(400).json({ error: 'BAD_REQUEST' })
      return
    }
    const outcome = await modes.set(wanted.data)
    if (!outcome.ok) {
      response.status(409).json({ error: 'LIVE_UNAVAILABLE', message: outcome.reason })
      return
    }
    response.json(modes.get())
  })

  app.get('/proof', (_request, response) => {
    response.json(proofRuns.snapshot())
  })

  app.post('/proof/:kind/run', (request: Request, response: Response) => {
    const kind = request.params.kind as ProofKind
    if (!proofKinds.includes(kind)) {
      response.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    const started = proofRuns.start(kind)
    response.status(started ? 202 : 409).json(proofRuns.snapshot()[kind])
  })

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

  // Demo faults on a branch service: answer slowly, or behave as if Jev were unreachable.
  const forwardFault =
    (fault: 'delay' | 'judge') => async (request: Request, response: Response) => {
      const baseUrl = slowableServices[request.params.name as string]
      if (!baseUrl) {
        response.status(404).json({ error: 'NOT_FOUND' })
        return
      }
      try {
        const forwarded = await fetch(`${baseUrl}/faults/${fault}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request.body ?? {}),
        })
        response.status(forwarded.status).json(await forwarded.json())
      } catch (error) {
        response.status(503).json({ error: 'UNAVAILABLE', message: String(error) })
      }
    }
  app.post('/faults/:name/delay', forwardFault('delay'))
  app.post('/faults/:name/judge', forwardFault('judge'))

  app.post('/demo/reset', async (_request, response) => {
    response.json(await resetDemo(supervisor))
  })

  return app
}
