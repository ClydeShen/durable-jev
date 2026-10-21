import type { Server } from 'node:http'
import express, { type Express } from 'express'

export const createServiceApp = (serviceName: string): Express => {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.get('/health', (_request, response) => {
    response.json({ service: serviceName, status: 'ok', pid: process.pid })
  })
  return app
}

export const startService = (
  app: Express,
  options: { serviceName: string; port: number; onClose?: () => void },
): Promise<Server> => {
  return new Promise((resolve) => {
    const server = app.listen(options.port, () => {
      console.log(`${options.serviceName} listening on http://localhost:${options.port}`)
      resolve(server)
    })
    const shutdown = () => {
      // Long-lived connections (event streams) would otherwise keep the port open forever.
      server.closeAllConnections()
      server.close(() => {
        options.onClose?.()
        process.exit(0)
      })
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  })
}
