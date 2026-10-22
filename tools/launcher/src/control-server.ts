import { createServer, type Server } from 'node:http'
import type { Supervisor } from './supervisor.js'

export function controlServer(supervisor: Supervisor): Server {
  return createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    const action = /^\/services\/([\w-]+)\/(crash|start)$/.exec(request.url ?? '')
    if (request.method === 'GET' && request.url === '/services')
      return send(200, supervisor.states())
    if (request.method === 'POST' && action) {
      const [, name = '', verb] = action
      const done = verb === 'crash' ? supervisor.crash(name) : supervisor.start(name)
      return send(done ? 200 : 409, { name, verb, done, services: supervisor.states() })
    }
    send(404, { error: 'unknown control request' })
  })
}
