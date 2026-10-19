import { type ChildProcess, spawn } from 'node:child_process'

export type ManagedProcessDefinition = {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  healthUrl?: string
}

export type ManagedProcessState = 'running' | 'stopped' | 'exited'

export type ManagedProcessStatus = {
  name: string
  state: ManagedProcessState
  pid?: number
  exitCode?: number | null
  healthUrl?: string
}

type ManagedProcess = {
  definition: ManagedProcessDefinition
  child?: ChildProcess
  state: ManagedProcessState
  exitCode?: number | null
}

export class ProcessSupervisor {
  private readonly processes = new Map<string, ManagedProcess>()

  constructor(
    definitions: readonly ManagedProcessDefinition[],
    private readonly log: (line: string) => void = (line) => console.log(line),
  ) {
    for (const definition of definitions) {
      this.processes.set(definition.name, { definition, state: 'stopped' })
    }
  }

  names(): string[] {
    return [...this.processes.keys()]
  }

  async start(name: string): Promise<void> {
    const managed = this.require(name)
    if (managed.state === 'running') return
    const { definition } = managed
    const child = spawn(definition.command, definition.args, {
      env: { ...process.env, ...definition.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    managed.child = child
    managed.state = 'running'
    managed.exitCode = undefined
    const prefixLines = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) this.log(`[${name}] ${line}`)
    }
    child.stdout?.on('data', prefixLines)
    child.stderr?.on('data', prefixLines)
    child.once('exit', (code) => {
      if (managed.child !== child) return
      managed.state = managed.state === 'stopped' ? 'stopped' : 'exited'
      managed.exitCode = code
      managed.child = undefined
      this.log(`[${name}] exited with ${code}`)
    })
    if (definition.healthUrl) await waitForHealth(definition.healthUrl)
  }

  async stop(name: string): Promise<void> {
    await this.terminate(name, 'SIGTERM')
  }

  async kill(name: string): Promise<void> {
    await this.terminate(name, 'SIGKILL')
  }

  async restart(name: string): Promise<void> {
    await this.stop(name)
    await this.start(name)
  }

  async startAll(): Promise<void> {
    for (const name of this.names()) await this.start(name)
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.names().map((name) => this.stop(name)))
  }

  status(): ManagedProcessStatus[] {
    return [...this.processes.values()].map(({ definition, child, state, exitCode }) => ({
      name: definition.name,
      state,
      ...(child?.pid === undefined ? {} : { pid: child.pid }),
      ...(exitCode === undefined ? {} : { exitCode }),
      ...(definition.healthUrl === undefined ? {} : { healthUrl: definition.healthUrl }),
    }))
  }

  private async terminate(name: string, signal: NodeJS.Signals): Promise<void> {
    const managed = this.require(name)
    const child = managed.child
    managed.state = signal === 'SIGKILL' ? 'exited' : 'stopped'
    if (!child || child.exitCode !== null) return
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill(signal)
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 3000)
    await exited
    clearTimeout(forceKill)
  }

  private require(name: string): ManagedProcess {
    const managed = this.processes.get(name)
    if (!managed) throw new Error(`unknown process ${name}`)
    return managed
  }
}

export async function waitForHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${url} did not become healthy within ${timeoutMs}ms`)
}
