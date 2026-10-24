import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JevJudge } from '@durable-jev/model-providers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { budgetedJevFetch, readJevAllowance } from './jev-allowance.js'

const directories: string[] = []
const endpoint = 'https://api.typesafe.ai/v1/systemone'
const init = { method: 'POST', body: '{}' }
function journal() {
  const directory = mkdtempSync(join(tmpdir(), 'jev-allowance-'))
  directories.push(directory)
  const path = join(directory, 'allowance.jsonl')
  writeFileSync(path, '{"authorization":"jev-2026-10-24","perStep":5,"total":20}\n')
  vi.stubEnv('MODEL_MODE', 'live')
  return path
}
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('bounded Jev requests', () => {
  it('retains a reservation after process exit before the response is recorded', async () => {
    const path = journal()
    const moduleUrl = new URL('../dist/jev-allowance.js', import.meta.url).href
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { budgetedJevFetch } from ${JSON.stringify(moduleUrl)};
      await budgetedJevFetch(${JSON.stringify(path)}, 'authoring-review', 'interrupted', async () => {
        process.exit(137);
      })(${JSON.stringify(endpoint)}, ${JSON.stringify(init)});
    `,
      ],
      { encoding: 'utf8', timeout: 10_000, env: { ...process.env, MODEL_MODE: 'live' } },
    )
    expect(child.error).toBeUndefined()
    expect(child.status).toBe(137)
    expect(readJevAllowance(path)).toHaveLength(1)
    const transport = vi.fn(async () => new Response('{}'))
    const resumed = budgetedJevFetch(path, 'authoring-review', 'resumed', transport)
    for (let index = 0; index < 4; index++) await resumed(endpoint, init)
    await expect(resumed(endpoint, init)).rejects.toThrow('exhausted')
    expect(transport).toHaveBeenCalledTimes(4)
  })

  it('persists reservations before sending and shares limits between reopened clients', async () => {
    const path = journal()
    const transport = vi.fn(async () => {
      expect(readJevAllowance(path).length).toBeGreaterThan(0)
      return new Response('{}')
    })
    for (let index = 0; index < 5; index++)
      await budgetedJevFetch(path, 'authoring-review', `run-${index}`, transport)(endpoint, init)
    await expect(
      budgetedJevFetch(path, 'authoring-review', 'later', transport)(endpoint, init),
    ).rejects.toThrow('exhausted')
    expect(transport).toHaveBeenCalledTimes(5)
    expect(transport.mock.calls[0]).toEqual([endpoint, { ...init, redirect: 'manual' }])
    for (const step of ['agent-comparison', 'blind-evaluation', 'insurance'] as const)
      for (let index = 0; index < 5; index++)
        await budgetedJevFetch(path, step, 'next', transport)(endpoint, init)
    expect(readJevAllowance(path)).toHaveLength(20)
    await expect(
      budgetedJevFetch(path, 'insurance', 'overflow', transport)(endpoint, init),
    ).rejects.toThrow('exhausted')
    expect(transport).toHaveBeenCalledTimes(20)
  })

  it('counts failed attempts and refuses missing, corrupt or locked journals without sending', async () => {
    const path = journal()
    const transport = vi.fn(async () => {
      throw new Error('timeout')
    })
    await expect(
      budgetedJevFetch(path, 'authoring-review', 'failed', transport)(endpoint, init),
    ).rejects.toThrow('timeout')
    expect(readJevAllowance(path)).toHaveLength(1)
    writeFileSync(`${path}.lock`, '')
    await expect(
      budgetedJevFetch(path, 'authoring-review', 'locked', transport)(endpoint, init),
    ).rejects.toThrow()
    await expect(
      budgetedJevFetch(`${path}.missing`, 'authoring-review', 'missing', transport)(endpoint, init),
    ).rejects.toThrow()
    const corrupt = join(directories[0] as string, 'corrupt.jsonl')
    writeFileSync(corrupt, `${readFileSync(path, 'utf8')}{partial`)
    await expect(
      budgetedJevFetch(corrupt, 'authoring-review', 'corrupt', transport)(endpoint, init),
    ).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('rejects unapproved destinations and scripted mode before reserving', async () => {
    const path = journal()
    const transport = vi.fn(async () => new Response('{}'))
    const guarded = budgetedJevFetch(path, 'authoring-review', 'guard', transport)
    await expect(guarded('https://example.com', init)).rejects.toThrow('endpoint')
    vi.stubEnv('MODEL_MODE', 'scripted')
    await expect(guarded(endpoint, init)).rejects.toThrow('MODEL_MODE')
    expect(readJevAllowance(path)).toHaveLength(0)
    expect(transport).not.toHaveBeenCalled()
  })

  it('counts an SDK request once and does not retry a 429 response', async () => {
    const path = journal()
    const transport = vi.fn(
      async () => new Response('{"error":{"message":"rate limited"}}', { status: 429 }),
    )
    const judge = new JevJudge({
      apiKey: 'recorded',
      fetch: budgetedJevFetch(path, 'authoring-review', 'sdk', transport),
    })
    await expect(
      judge.ask({ kind: 'noul', questionId: 'test', promptVersion: '1', text: 'Matches?' }, {}),
    ).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
    expect(readJevAllowance(path)).toHaveLength(1)
  })
})
