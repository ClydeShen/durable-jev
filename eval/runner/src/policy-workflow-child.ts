import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalJson } from '@durable-jev/contracts'
import { packHashes, writeEvidence } from './policy-evidence.js'
import { PolicyWorkflow, type WorkflowScenario, type WorkflowState } from './policy-workflow.js'

const [phase, directory = ''] = process.argv.slice(2)
if (!['control', 'before-transition', 'after-transition', 'resume'].includes(phase ?? '')) {
  throw new Error(`unknown workflow phase: ${phase}`)
}
if (process.env.MODEL_MODE === 'live') throw new Error('policy workflow requires scripted mode')
const plan = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')) as {
  scenario: WorkflowScenario
  hashes: { baseline: Record<string, string>; candidate: Record<string, string> }
}
const { scenario, hashes } = plan
for (const name of ['baseline', 'candidate'] as const) {
  if (canonicalJson(packHashes(scenario[name])) !== canonicalJson(hashes[name])) {
    throw new Error(`${name} pack changed after the experiment plan was frozen`)
  }
}

const beforeFile = join(directory, 'before.json')
if (phase !== 'resume') {
  const original = new PolicyWorkflow(scenario.baseline, directory)
  writeEvidence(beforeFile, await original.prepare(scenario))
  if (phase === 'before-transition') process.exit(137)
  original.close()
}

const before = JSON.parse(readFileSync(beforeFile, 'utf8')) as WorkflowState
const activePack = scenario.activation === 'pinned' ? scenario.baseline : scenario.candidate
const workflow = new PolicyWorkflow(activePack, directory)
try {
  const after = await workflow.transition()
  if (phase === 'after-transition') {
    writeEvidence(join(directory, 'interrupted.json'), after)
    process.exit(137)
  }
  const result = { before, after, finish: await workflow.finish(before) }
  writeEvidence(join(directory, 'result.json'), result)
} finally {
  workflow.close()
}
