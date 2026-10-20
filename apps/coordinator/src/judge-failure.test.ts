import { readFileSync } from 'node:fs'
import type { ReferenceData } from '@durable-jev/contracts'
import {
  buildRuleConfiguration,
  JudgeUnavailableError,
  scriptedJudgeFor,
} from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch-evaluators.js'
import { CoordinatorService } from './coordinator-service.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')

describe('semantic judge unavailable (F05)', () => {
  it('puts the order in a technical state, never a pass, and recovers on re-evaluation', async () => {
    const configuration = buildRuleConfiguration(
      readJson('rules.json'),
      readJson('mock-policy-parameters.json'),
      {
        mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
        semanticQuestions: readJson('semantic-questions.json'),
      },
    )
    let jevDown = true
    const coordinator = new CoordinatorService({
      database: openDatabase(':memory:', coordinatorMigrations),
      configuration,
      evaluators: inProcessEvaluators(
        configuration,
        readJson('mock-data/reference-data.json') as ReferenceData,
        undefined,
        (request) =>
          jevDown
            ? {
                provider: 'jev',
                modelId: 'jev-1.14.0',
                ask: async () => {
                  throw new JudgeUnavailableError('jev', 3, '429 rate limited')
                },
              }
            : scriptedJudgeFor(request),
      ),
    })

    await expect(
      coordinator.submitCase({
        shipment: logOne.shipment,
        scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
      }),
    ).rejects.toThrow(/jev unavailable after 3 attempt/)
    const failed = coordinator.getCase(logOne.caseId)
    expect(failed.orderStatus).toBe('TECHNICAL_FAILURE')
    expect(failed.checks.filter((check) => check.ruleId === 'R03')).toEqual([])

    jevDown = false
    const recovered = await coordinator.reevaluate(logOne.caseId)
    expect(recovered.orderStatus).toBe('AWAITING_HUMAN')
    expect(recovered.checks.find((check) => check.ruleId === 'R03')?.gateStatus).toBe('PASS')
  })
})
