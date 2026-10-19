import { rmSync } from 'node:fs'
import { listCaseIds, loadCase } from '@durable-jev/eval-runner'
import type { ProcessSupervisor } from './process-supervisor.js'
import { coordinatorDatabasePath, ports } from './service-manifest.js'

export type DemoResetResult = { loadedCaseIds: string[] }

export async function resetDemo(supervisor: ProcessSupervisor): Promise<DemoResetResult> {
  await supervisor.stop('coordinator')
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${coordinatorDatabasePath}${suffix}`, { force: true })
  }
  await supervisor.start('coordinator')

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
