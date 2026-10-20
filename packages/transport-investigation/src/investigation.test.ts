import { describe, expect, it } from 'vitest'
import { checkCandidate } from './candidate-check.js'
import { createInvestigationRuntime } from './investigation-runtime.js'
import { investigationTools } from './investigation-tools.js'
import {
  logFourDependencies as dependencies,
  investigated,
  securaCancelled as request,
} from './log-four.fixture.js'

describe('checkCandidate', () => {
  it('passes a qualified reefer and names the rules a general box truck fails', () => {
    expect(
      checkCandidate(
        investigated,
        { legId: 'LOG-004-LEG-1', carrierId: 'CAR-GLACIER', vehicleId: 'VEH-GL-REEFER-4T' },
        dependencies,
      ),
    ).toMatchObject({ fits: true, problems: [] })
    const boxTruck = checkCandidate(
      investigated,
      { legId: 'LOG-004-LEG-1', carrierId: 'CAR-NORTHLINE', vehicleId: 'VEH-NL-BOX-7T' },
      dependencies,
    )
    expect(boxTruck.fits).toBe(false)
    expect(boxTruck.problems).toEqual(
      expect.arrayContaining(['R11 FAIL for LOG-004-ITEM-1', 'R16 FAIL for LOG-004-ITEM-1']),
    )
  })

  it('refuses a vehicle that belongs to another carrier', () => {
    expect(
      checkCandidate(
        investigated,
        { legId: 'LOG-004-LEG-1', carrierId: 'CAR-GLACIER', vehicleId: 'VEH-PL-REEFER-5T' },
        dependencies,
      ),
    ).toMatchObject({ fits: false, problems: [expect.stringContaining('not a vehicle of')] })
  })
})

describe('transport investigation agent', () => {
  it('proposes Glacier for LOG-004 after Secura cancels', async () => {
    const session = await createInvestigationRuntime(dependencies).open({
      caseId: investigated.caseId,
      caseRevision: 1,
      purpose: 'replace-carrier',
    })
    const run = await session.submit({ requestId: 'req-1', input: request })
    expect(await run.outcome).toEqual({
      status: 'completed',
      result: expect.objectContaining({
        outcome: 'REPLACEMENT',
        carrierId: 'CAR-GLACIER',
        vehicleId: 'VEH-GL-REEFER-4T',
      }),
    })
    const toolCalls = session.events().filter((event) => event.type === 'tool.called')
    expect(toolCalls.length).toBeLessThanOrEqual(10)
  })

  it('refuses to record a proposal that fails a fit rule', async () => {
    const result = await investigationTools(dependencies).call(
      'submit_investigation_result',
      {
        outcome: 'REPLACEMENT',
        legId: 'LOG-004-LEG-1',
        carrierId: 'CAR-NORTHLINE',
        vehicleId: 'VEH-NL-BOX-7T',
        rationale: 'cheapest',
      },
      'agent',
      { runId: 'r', caseId: investigated.caseId, caseRevision: 1, operationIdFor: (id) => id },
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'EXECUTION_FAILED' } })
  })

  it('reports NO_CANDIDATE when every other carrier is unavailable', async () => {
    const session = await createInvestigationRuntime({
      ...dependencies,
      request: { ...request, unavailableCarrierIds: ['CAR-SECURA', 'CAR-GLACIER'] },
    }).open({ caseId: investigated.caseId, caseRevision: 1, purpose: 'replace-carrier' })
    const run = await session.submit({
      requestId: 'req-1',
      input: { ...request, unavailableCarrierIds: ['CAR-SECURA', 'CAR-GLACIER'] },
    })
    expect(await run.outcome).toMatchObject({
      status: 'completed',
      result: { outcome: 'NO_CANDIDATE' },
    })
  })
})
