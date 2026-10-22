export interface ServiceDefinition {
  name: string
  entry: string
  port: number
  controllable: boolean
  env?: Record<string, string>
}

export const controlPort = 4199

const agentService = (name: string, port: number): ServiceDefinition => ({
  name,
  entry: 'apps/agent/dist/main.js',
  port,
  controllable: true,
  env: { AGENT_ID: name },
})

const agents = [
  agentService('cargo-assurance', 4101),
  agentService('transport-planning', 4102),
  agentService('commercial-control', 4103),
  agentService('destination-compliance', 4104),
]

const coordinator: ServiceDefinition = {
  name: 'order-coordination',
  entry: 'apps/coordinator/dist/main.js',
  port: 4100,
  controllable: false,
  env: {
    CONTROL_URL: `http://localhost:${controlPort}`,
    AGENT_ENDPOINTS: agents
      .map((agent) => `${agent.name}=http://localhost:${agent.port}`)
      .join(','),
  },
}

export const services: readonly ServiceDefinition[] = [...agents, coordinator]

export const consoleUrl = `http://localhost:${coordinator.port}`
