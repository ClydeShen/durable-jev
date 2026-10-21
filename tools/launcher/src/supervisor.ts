import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { ServiceDefinition } from './services.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname

export interface ServiceState {
  name: string
  port: number
  controllable: boolean
  running: boolean
  starts: number
}

function prefixLines(stream: NodeJS.ReadableStream | null, name: string) {
  if (!stream) return
  createInterface({ input: stream }).on('line', (line) => {
    process.stdout.write(`[${name}] ${line}\n`)
  })
}

export class Supervisor {
  private readonly children = new Map<string, ChildProcess>()
  private readonly starts = new Map<string, number>()

  constructor(private readonly services: readonly ServiceDefinition[]) {}

  startAll() {
    for (const service of this.services) this.start(service.name)
  }

  states(): ServiceState[] {
    return this.services.map((service) => ({
      name: service.name,
      port: service.port,
      controllable: service.controllable,
      running: this.children.has(service.name),
      starts: this.starts.get(service.name) ?? 0,
    }))
  }

  start(name: string): boolean {
    const service = this.services.find((candidate) => candidate.name === name)
    if (!service || this.children.has(name)) return false
    const child = spawn(process.execPath, [service.entry], {
      cwd: repositoryRoot,
      env: { ...process.env, ...service.env, PORT: String(service.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    prefixLines(child.stdout, name)
    prefixLines(child.stderr, name)
    child.on('exit', (code, signal) => {
      this.children.delete(name)
      process.stdout.write(`[launcher] ${name} exited (${signal ?? code})\n`)
    })
    this.children.set(name, child)
    this.starts.set(name, (this.starts.get(name) ?? 0) + 1)
    return true
  }

  crash(name: string): boolean {
    const service = this.services.find((candidate) => candidate.name === name)
    const child = this.children.get(name)
    if (!service?.controllable || !child) return false
    child.kill('SIGKILL')
    return true
  }

  stopAll() {
    for (const child of this.children.values()) child.kill('SIGTERM')
  }
}
