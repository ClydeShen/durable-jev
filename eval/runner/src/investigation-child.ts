import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalJson } from '@durable-jev/contracts'
import { assertPackHashes, writeEvidence } from './experiment-evidence.js'
import { materials } from './faults/lab.js'
import { InvestigationExperiment, type InvestigationScenario } from './investigation-experiment.js'

const [phase, directory = ''] = process.argv.slice(2)
if (!['control', 'interrupt', 'resume'].includes(phase ?? ''))
  throw new Error(`unknown phase ${phase}`)
if (process.env.MODEL_MODE === 'live')
  throw new Error('this controlled experiment is scripted only')
const plan = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')) as {
  scenario: InvestigationScenario
  hashes: Record<string, string>
}
assertPackHashes(materials, plan.hashes)
const experiment = new InvestigationExperiment(directory, plan.scenario)
try {
  if (phase !== 'resume') {
    await experiment.lab.submit()
    writeFileSync(join(directory, 'original.json'), canonicalJson(experiment.lab.shipment))
  }
  await experiment.open()
  if (phase === 'interrupt') {
    experiment.interruptAfterReads(() => {
      writeEvidence(join(directory, 'interrupted.json'), {
        point: 'after reads, before check/submit',
        exitCode: 137,
      })
      process.exit(137)
    })
  }
  const resumeError = await experiment.investigate(phase === 'resume')
  const original = readFileSync(join(directory, 'original.json'), 'utf8')
  writeEvidence(join(directory, 'result.json'), await experiment.evidence(original, resumeError))
} finally {
  await experiment.close()
}
