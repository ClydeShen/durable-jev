import type { Server } from 'node:http'
import { type Role, roleSchema } from '@durable-jev/contracts'
import express, { type ErrorRequestHandler, type Express, type Request } from 'express'
import { type Logger, pino } from 'pino'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface Actor {
  id: string
  role: Role
}

export function actorOf(request: Request): Actor {
  const role = roleSchema.safeParse(request.header('x-demo-role'))
  if (!role.success) throw new HttpError(401, 'x-demo-role must name a demo role')
  return { id: request.header('x-demo-user') ?? `demo-${role.data}`, role: role.data }
}

const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message })
      return
    }
    if (error instanceof ZodError) {
      response.status(400).json({ error: 'invalid request', issues: error.issues })
      return
    }
    logger.error({ err: error }, 'request failed')
    response.status(500).json({ error: String(error) })
  }

export interface Service {
  app: Express
  logger: Logger
  listen(port: number): Promise<Server>
}

export function createService(name: string): Service {
  const logger = pino({ name })
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.get('/health', (_request, response) => {
    response.json({ service: name, status: 'up' })
  })
  return {
    app,
    logger,
    listen: (port) =>
      new Promise((resolve) => {
        app.use(errorHandler(logger))
        const server = app.listen(port, () => {
          logger.info({ port }, `${name} listening`)
          resolve(server)
        })
      }),
  }
}
