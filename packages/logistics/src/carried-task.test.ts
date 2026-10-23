import { fileURLToPath } from 'node:url'
import { ScriptedJudge } from '@durable-jev/model-providers'
import { describe, expect, it } from 'vitest'
import { loadCaseFile } from './case-file.js'
import { createLocalLogisticsAgents } from './logistics-runtime.js'
import { applyRevision } from './revision.js'

const materials = fileURLToPath(new URL('../../../eval/materials/', import.meta.url))

describe('a change that leaves a waiting rule untouched', () => {
  it('keeps its task open on the new revision, so the person can still act on it', async () => {
    const caseFile = loadCaseFile(`${materials}cases/LOG-007.json`)
    const agents = createLocalLogisticsAgents({
      materialsDirectory: materials,
      judgeFor: () => new ScriptedJudge(caseFile.scriptedJudgements),
      now: () => '2026-11-01T08:00:00.000Z',
    })
    const { caseId } = caseFile.shipment
    await agents.orchestrator.submit(caseFile.shipment)
    const reroute = caseFile.events.find((event) => event.kind === 'revise')
    if (reroute?.kind !== 'revise') throw new Error('LOG-007 has no scripted change')
    await agents.orchestrator.submit(applyRevision(caseFile.shipment, reroute.patch))

    const { tasks } = await agents.view(caseId)
    const recipient = tasks.find((task) => task.ruleId === 'CUST-MEDI-5' && task.status === 'OPEN')
    expect(recipient?.target.caseRevision).toBe(2)
    const decision = await agents.orchestrator.decide(recipient?.humanTaskId ?? '', {
      type: 'complete',
      actor: { id: 'wen', role: 'warehouseOperator' },
      fields: { recipientName: 'Dr. Lee', deliveryNoteRef: 'DN-7' },
      evidenceRefs: ['DN-7'],
    })
    expect(decision).toMatchObject({ ok: true })
  })
})
