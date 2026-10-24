import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'

const steps = ['authoring-review', 'agent-comparison', 'blind-evaluation', 'insurance'] as const
type JevStep = (typeof steps)[number]
type Transport = (url: string, init?: RequestInit) => Promise<Response>

interface Reservation {
  sequence: number
  step: JevStep
  run: string
  bodyHash: string
  reservedAt: string
}

/** One authoritative journal; missing/corrupt files fail closed, never create a fresh allowance. */
export function readJevAllowance(path: string): Reservation[] {
  const journal = readFileSync(path, 'utf8')
  if (!journal.endsWith('\n')) throw new Error('incomplete Jev allowance journal')
  const [header, ...entries] = journal
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  if (header.authorization !== 'jev-2026-10-24' || header.perStep !== 5 || header.total !== 20)
    throw new Error('unrecognized Jev authorization')
  const valid = entries.every(
    (entry, index) =>
      entry.sequence === index + 1 &&
      steps.includes(entry.step) &&
      typeof entry.run === 'string' &&
      entry.run.length > 0 &&
      typeof entry.bodyHash === 'string' &&
      /^[a-f0-9]{64}$/.test(entry.bodyHash) &&
      typeof entry.reservedAt === 'string' &&
      Number.isFinite(Date.parse(entry.reservedAt)),
  )
  if (
    !valid ||
    entries.length > 20 ||
    steps.some((step) => entries.filter((entry) => entry.step === step).length > 5)
  )
    throw new Error('invalid Jev allowance journal')
  return entries as Reservation[]
}

function reserve(path: string, step: JevStep, run: string, body: string) {
  const lock = `${path}.lock`
  const lockFile = openSync(lock, 'wx')
  try {
    const attempts = readJevAllowance(path)
    if (
      !steps.includes(step) ||
      !run ||
      attempts.length >= 20 ||
      attempts.filter((entry) => entry.step === step).length >= 5
    )
      throw new Error('Jev request allowance exhausted or invalid step')
    const record: Reservation = {
      sequence: attempts.length + 1,
      step,
      run,
      bodyHash: createHash('sha256').update(body).digest('hex'),
      reservedAt: new Date().toISOString(),
    }
    const journal = openSync(path, constants.O_WRONLY | constants.O_APPEND)
    try {
      writeFileSync(journal, `${JSON.stringify(record)}\n`)
      fsyncSync(journal)
    } finally {
      closeSync(journal)
    }
  } finally {
    closeSync(lockFile)
    unlinkSync(lock)
  }
}

/** Counts at the SDK transport boundary; redirects cannot make uncounted follow-up requests. */
export function budgetedJevFetch(
  path: string,
  step: JevStep,
  run: string,
  transport: Transport = fetch,
): Transport {
  return async (url, init) => {
    if (process.env.MODEL_MODE !== 'live')
      throw new Error('bounded Jev calls require MODEL_MODE=live')
    if (
      url !== 'https://api.typesafe.ai/v1/systemone' ||
      init?.method !== 'POST' ||
      typeof init.body !== 'string'
    )
      throw new Error('only the pinned Jev endpoint and POST body are allowed')
    reserve(path, step, run, init.body)
    return transport(url, { ...init, redirect: 'manual' })
  }
}
