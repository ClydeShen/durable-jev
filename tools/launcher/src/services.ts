export interface ServiceDefinition {
  name: string
  entry: string
  port: number
  env?: Record<string, string>
}

const agentService = (name: string, port: number): ServiceDefinition => ({
  name,
  entry: 'apps/agent/dist/main.js',
  port,
  env: { AGENT_ID: name },
})

const agents = [
  agentService('cargo-assurance', 4101),
  agentService('transport-planning', 4102),
  agentService('commercial-control', 4103),
]

const coordinator: ServiceDefinition = {
  name: 'order-coordination',
  entry: 'apps/coordinator/dist/main.js',
  port: 4100,
  env: {
    AGENT_ENDPOINTS: agents
      .map((agent) => `${agent.name}=http://localhost:${agent.port}`)
      .join(','),
  },
}

export const services: readonly ServiceDefinition[] = [...agents, coordinator]

export const consoleUrl = `http://localhost:${coordinator.port}`
