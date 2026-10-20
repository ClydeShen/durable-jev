import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { ReferenceData } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch-evaluators.js'
import { CoordinatorService } from './coordinator-service.js'
import { createCoordinatorApp } from './http/coordinator-app.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logFive = readJson('cases/LOG-005.json')

async function submitted() {
  const configuration = buildRuleConfiguration(
    readJson('rules.json'),
    readJson('mock-policy-parameters.json'),
    {
      mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
      semanticQuestions: readJson('semantic-questions.json'),
    },
  )
  const coordinator = new CoordinatorService({
    database: openDatabase(':memory:', coordinatorMigrations),
    configuration,
    evaluators: inProcessEvaluators(
      configuration,
      readJson('mock-data/reference-data.json') as ReferenceData,
    ),
  })
  await coordinator.submitCase({
    shipment: logFive.shipment,
    evidence: logFive.evidence,
    scriptedSemanticAnswers: logFive.scriptedSemanticAnswers,
  })
  return coordinator
}

const quote = (amountCents: number) => ({ kind: 'changeQuote' as const, amountCents })

describe('concurrent plan changes (F15)', () => {
  it('refuses a change made against a revision that is no longer current', async () => {
    const coordinator = await submitted()
    await coordinator.applyChange(logFive.caseId, quote(200_000), 'COMMERCIAL_MANAGER', 1)
    await expect(
      coordinator.applyChange(logFive.caseId, quote(210_000), 'COMMERCIAL_MANAGER', 1),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const view = coordinator.getCase(logFive.caseId)
    expect(view.shipment.caseRevision).toBe(2)
    expect(view.shipment.quote.amountCents).toBe(200_000)
  })

  it('reads the base revision from If-Match over HTTP', async () => {
    const coordinator = await submitted()
    const server = createCoordinatorApp(coordinator).listen(0)
    await new Promise((ready) => server.once('listening', ready))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const change = (ifMatch: string) =>
      fetch(`${url}/cases/${logFive.caseId}/changes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-role': 'COMMERCIAL_MANAGER',
          'if-match': ifMatch,
        },
        body: JSON.stringify(quote(200_000)),
      })
    try {
      expect((await change('1')).status).toBe(200)
      expect((await change('r1')).status).toBe(409)
      expect((await change('"r2"')).status).toBe(200)
    } finally {
      server.close()
    }
  })
})
