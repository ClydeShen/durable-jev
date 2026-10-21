import { spawn } from 'node:child_process'
import { type ProofItem, parseProofOutput } from './proof-output.helpers.js'
import { repositoryRoot } from './service.manifest.js'

export type ProofKind = 'replay' | 'faults'
export const proofKinds: readonly ProofKind[] = ['replay', 'faults']

export type ProofRun = {
  state: 'idle' | 'running' | 'done'
  startedAt?: string
  finishedAt?: string
  passed?: boolean
  summary?: string
  items: ProofItem[]
}

type Runner = (kind: ProofKind) => Promise<{ exitCode: number | null; output: string }>

// Runs the same commands a developer would, but never against Jev: proof runs are scripted.
const runCommand: Runner = (kind) =>
  new Promise((resolve) => {
    const child = spawn('pnpm', [kind], {
      cwd: repositoryRoot,
      env: { ...process.env, MODEL_MODE: 'scripted' },
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.once('error', (error) => resolve({ exitCode: null, output: String(error) }))
    child.once('close', (exitCode) => resolve({ exitCode, output }))
  })

export const createProofRuns = (run: Runner = runCommand, now = () => new Date().toISOString()) => {
  const runs: Record<ProofKind, ProofRun> = {
    replay: { state: 'idle', items: [] },
    faults: { state: 'idle', items: [] },
  }

  const start = (kind: ProofKind): boolean => {
    if (runs[kind].state === 'running') return false
    runs[kind] = { state: 'running', startedAt: now(), items: [] }
    run(kind).then(({ exitCode, output }) => {
      const parsed = parseProofOutput(output)
      runs[kind] = {
        state: 'done',
        ...(runs[kind].startedAt ? { startedAt: runs[kind].startedAt } : {}),
        finishedAt: now(),
        passed: exitCode === 0 && parsed.items.length > 0,
        ...(parsed.summary ? { summary: parsed.summary } : {}),
        items: parsed.items,
      }
    })
    return true
  }

  return { start, snapshot: () => ({ ...runs }) }
}
