export interface ServiceDefinition {
  name: string
  entry: string
  port: number
}

export const services: readonly ServiceDefinition[] = [
  { name: 'order-coordination', entry: 'apps/coordinator/dist/main.js', port: 4100 },
]

export const consoleUrl = `http://localhost:${services[0]?.port}`
