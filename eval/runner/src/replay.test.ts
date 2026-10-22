import { join } from 'node:path'
import { loadCaseCatalog } from '@durable-jev/logistics'
import { describe, expect, it } from 'vitest'
import { replayCase } from './replay.js'

const materials = new URL('../../materials/', import.meta.url).pathname

describe('demo case replays', () => {
  for (const caseFile of loadCaseCatalog(join(materials, 'cases')).values()) {
    it(`${caseFile.shipment.caseId} meets every stage expectation`, async () => {
      const replay = await replayCase(caseFile, materials)
      const failing = replay.steps.filter((step) => step.problems.length > 0)
      expect(failing).toEqual([])
    })
  }
})
