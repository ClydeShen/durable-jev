import { describe, expect, it } from 'vitest'
import { listCaseIds, loadCase } from './materials.helpers.js'
import { loadReplayConfiguration, replayCase } from './replay.service.js'

const configuration = loadReplayConfiguration()

describe.each(listCaseIds())('replay %s', (caseName) => {
  it('meets every stage expectation of its event script', async () => {
    const result = await replayCase(loadCase(caseName), configuration)
    const failures = result.stages.flatMap((stage) =>
      stage.failures.map((failure) => `step ${stage.index + 1} (${stage.step}): ${failure}`),
    )
    expect(failures).toEqual([])
  })
})

describe('replay runner', () => {
  it('reports a stage whose expectation is not met', async () => {
    const logOne = loadCase('LOG-001')
    const [submit, ...rest] = logOne.eventScript
    const wrong = {
      ...logOne,
      eventScript: [{ ...submit, expect: { orderStatus: 'DISPATCHED' as const } }, ...rest],
    } as typeof logOne
    const result = await replayCase(wrong, configuration)
    expect(result.passed).toBe(false)
    expect(result.stages[0]?.failures).toEqual([
      'orderStatus: expected DISPATCHED, got AWAITING_HUMAN',
    ])
  })
})
