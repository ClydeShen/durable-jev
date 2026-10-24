import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '@durable-jev/contracts'

export function sourceRevision(root: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  return {
    sourceCommit: git('rev-parse', 'HEAD').trim(),
    sourceStatus: git('status', '--porcelain'),
  }
}

export function createExperimentDirectory(root: string, prefix: string): string {
  const directory = join(root, 'var/reports')
  mkdirSync(directory, { recursive: true })
  return mkdtempSync(join(directory, `${prefix}-`))
}

export function fileHash(path: string): string {
  return createHash('sha256')
    .update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex')
}

/** Hash all copied policy, reference data and scripted cases, not just the mutated parameter. */
export function packHashes(directory: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .sort()
      .map((path) => [relative(directory, path).replaceAll('\\', '/'), fileHash(path)]),
  )
}

export function writeEvidence(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function assertPackHashes(directory: string, expected: Record<string, string>): void {
  if (canonicalJson(packHashes(directory)) !== canonicalJson(expected)) {
    throw new Error(`pack changed after the experiment plan was frozen: ${directory}`)
  }
}

export function runExperimentProcess(
  entry: URL,
  directory: string,
  phase: string,
  expectedCode: number,
): number {
  const started = performance.now()
  const child = spawnSync(process.execPath, [fileURLToPath(entry), phase, directory], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  writeFileSync(join(directory, `${phase}.log`), `${child.stdout ?? ''}${child.stderr ?? ''}`)
  if (child.error || child.status !== expectedCode) {
    throw new Error(`experiment ${phase} exited ${child.status}: ${child.error ?? child.stderr}`)
  }
  return performance.now() - started
}
