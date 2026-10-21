import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { consoleUrl, type ServiceDefinition, services } from './services.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname

function prefixLines(stream: NodeJS.ReadableStream | null, name: string) {
  if (!stream) return
  createInterface({ input: stream }).on('line', (line) => {
    process.stdout.write(`[${name}] ${line}\n`)
  })
}

function start(service: ServiceDefinition): ChildProcess {
  const child = spawn(process.execPath, [service.entry], {
    cwd: repositoryRoot,
    env: { ...process.env, PORT: String(service.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  prefixLines(child.stdout, service.name)
  prefixLines(child.stderr, service.name)
  child.on('exit', (code, signal) => {
    process.stdout.write(`[launcher] ${service.name} exited (${signal ?? code})\n`)
  })
  return child
}

const children = services.map(start)
process.stdout.write(
  `[launcher] demo at ${consoleUrl} (MODEL_MODE=${process.env.MODEL_MODE ?? 'scripted'})\n`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM')
    process.exit(0)
  })
}
