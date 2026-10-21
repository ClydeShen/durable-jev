import { rmSync } from 'node:fs'
import { listCaseIds, loadCase } from '@durable-jev/eval-runner'
import type { ProcessSupervisor } from './process-supervisor.service.js'
import { dataServices, ports } from './service.manifest.js'

export type DemoResetResult = { loadedCaseIds: string[] }

export const resetDemo = async (supervisor: ProcessSupervisor): Promise<DemoResetResult> => {
  for (const service of [...dataServices].reverse()) await supervisor.stop(service.name)
  for (const { databasePath } of dataServices) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${databasePath}${suffix}`, { force: true })
  }
  for (const service of dataServices) await supervisor.start(service.name)

  const loadedCaseIds: string[] = []
  for (const caseName of listCaseIds()) {
    const caseFile = loadCase(caseName)
    const response = await fetch(`http://127.0.0.1:${ports.coordinator}/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shipment: caseFile.shipment,
        evidence: caseFile.evidence,
        scriptedSemanticAnswers: caseFile.scriptedSemanticAnswers,
      }),
    })
    if (!response.ok) throw new Error(`loading ${caseName} failed: ${await response.text()}`)
    loadedCaseIds.push(caseFile.caseId)
  }
  return { loadedCaseIds }
}
