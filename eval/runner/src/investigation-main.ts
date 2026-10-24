import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '@durable-jev/contracts'
import {
  createExperimentDirectory,
  fileHash,
  packHashes,
  runExperimentProcess,
  writeEvidence,
} from './experiment-evidence.js'
import type { InvestigationEvidence, InvestigationScenario } from './investigation-experiment.js'

if (process.env.MODEL_MODE === 'live')
  throw new Error('investigation controls require scripted mode')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const run = createExperimentDirectory(root, 'investigation')
const inputs = join(run, 'materials')
cpSync(join(root, 'eval/materials'), inputs, { recursive: true, errorOnExist: true })
const hashes = packHashes(inputs)
const child = new URL('./investigation-child.js', import.meta.url)

function expectedChecks(scenario: InvestigationScenario): number {
  if (scenario.offers === 'no-offers') return 0
  if (scenario.offers === 'no-valid') return 2
  return scenario.offers === 'first-valid' && scenario.strategy === 'first-valid' ? 1 : 3
}

function findings(
  result: InvestigationEvidence,
  scenario: InvestigationScenario,
  restart: boolean,
) {
  const problems: string[] = []
  const require = (condition: boolean, message: string) => {
    if (!condition) problems.push(message)
  }
  require(result.unchangedBeforeConfirmation, 'investigation changed the order before confirmation')
  require(!result.dispatched, 'investigation dispatched the order')
  for (const tool of ['get_case', 'search_capacity_offers']) {
    require(result.attempts.filter((attempt) => attempt.tool === tool).length ===
      1, `${tool} was lost or repeated`)
  }
  if (restart && scenario.storage === 'memory') {
    require(Boolean(
      result.resumeError?.includes('has no investigation scope'),
    ), 'missing-checkpoint failure was not observed')
    require(result.status === 'RUNNING' &&
      result.caseRevision === 1, 'memory loss changed business state')
    require(result.proposalEvents === 0 &&
      result.confirmationEvents === 0, 'memory loss created a result')
    return problems
  }
  require(!result.resumeError, `resume failed: ${result.resumeError}`)
  const checks = result.completedTools.filter((tool) => tool.tool === 'check_plan').length
  require(checks ===
    expectedChecks(
      scenario,
    ), `expected ${expectedChecks(scenario)} completed checks, observed ${checks}`)
  const proposed = scenario.offers === 'original' || scenario.offers === 'first-valid'
  require(result.status ===
    (proposed ? 'PROPOSED' : 'ESCALATED'), 'unexpected investigation outcome')
  if (proposed) {
    require(result.offerId === 'OFF-FROST-0630', 'unexpected selected offer')
    require(Boolean(result.checks?.length) &&
      result.checks?.every((check) => ['PASS', 'NOT_APPLICABLE'].includes(check.status)) ===
        true, 'proposal failed rule checks')
    require(result.wrongRole === 'ROLE_NOT_ALLOWED', 'wrong role could confirm')
    require(result.confirmation === 'ACCEPTED' &&
      result.caseRevision === 2, 'planner confirmation did not produce r2')
    require(result.repeatedConfirmation === 'NOT_PROPOSED', 'repeated confirmation was accepted')
    require(result.proposalEvents === 1 &&
      result.confirmationEvents === 1, 'duplicate or missing proposal/confirmation')
  } else {
    require(Boolean(result.escalation) && !result.offerId, 'no-valid-offer case was not explained')
    require(result.caseRevision === 1 &&
      result.proposalEvents === 0 &&
      result.confirmationEvents === 0, 'escalation applied a plan')
  }
  return problems
}

function execute(scenario: InvestigationScenario, restart: boolean) {
  const name = `${scenario.offers}-${scenario.strategy}-${scenario.storage}-${restart ? 'restart' : 'control'}`
  const directory = join(run, name)
  mkdirSync(directory)
  writeEvidence(join(directory, 'plan.json'), { scenario, hashes })
  const executionMs = runExperimentProcess(
    child,
    directory,
    restart ? 'interrupt' : 'control',
    restart ? 137 : 0,
  )
  if (restart) {
    const cut = JSON.parse(readFileSync(join(directory, 'interrupted.json'), 'utf8')) as {
      exitCode: number
    }
    if (cut.exitCode !== 137) throw new Error('missing injected process exit')
  }
  const resumeMs = restart ? runExperimentProcess(child, directory, 'resume', 0) : undefined
  const result = JSON.parse(
    readFileSync(join(directory, 'result.json'), 'utf8'),
  ) as InvestigationEvidence
  return {
    name,
    scenario,
    restart,
    executionMs,
    resumeMs,
    result,
    problems: findings(result, scenario, restart),
  }
}

const observations = []
for (const offers of ['original', 'first-valid', 'no-valid', 'no-offers'] as const) {
  for (const strategy of ['first-valid', 'check-all'] as const) {
    for (const storage of ['memory', 'durable'] as const) {
      for (const restart of [false, true])
        observations.push(execute({ offers, strategy, storage }, restart))
    }
  }
  process.stdout.write(`Completed investigation controls: ${offers}\n`)
}

function comparable(result: InvestigationEvidence): string {
  const { attempts: _attempts, ...decisions } = result
  return canonicalJson(decisions)
}

for (const observation of observations) {
  if (observation.restart && observation.scenario.storage === 'memory') continue
  const control = observations.find(
    (entry) =>
      !entry.restart &&
      entry.scenario.storage === 'memory' &&
      entry.scenario.offers === observation.scenario.offers &&
      entry.scenario.strategy === observation.scenario.strategy,
  )
  if (!control || comparable(control.result) !== comparable(observation.result)) {
    observation.problems.push(
      'completed tool results or business decisions differ from the control',
    )
  }
}

const sourceFiles = [
  'eval/runner/dist/investigation-main.js',
  'eval/runner/dist/investigation-child.js',
  'eval/runner/dist/investigation-experiment.js',
  'eval/runner/dist/experiment-evidence.js',
  'eval/runner/dist/faults/lab.js',
  'packages/agent-harness/dist/investigator.js',
  'packages/logistics/dist/reroute/reroute-desk.js',
  'packages/logistics/dist/reroute/reroute-tools.js',
  'packages/logistics/dist/reroute/scripted-rerouter.js',
  'pnpm-lock.yaml',
]
writeEvidence(join(run, 'report.json'), {
  generatedAt: new Date().toISOString(),
  baselineRef: 'baseline-2026-10-24-r2',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }),
  modelMode: 'scripted',
  reviewStatus: 'draft',
  humanMinutes: null,
  runtimeModelCalls: 0,
  comparison:
    'Authored first-valid vs check-all strategies; Pi MemoryStorage vs Pi SQLite. No live-model or non-Pi workflow comparison.',
  latencyMeaning:
    'single child-process observations including startup, not a benchmark or human effort',
  inputHashes: hashes,
  implementationHashes: Object.fromEntries(
    sourceFiles.map((path) => [path, fileHash(join(root, path))]),
  ),
  observations,
})
const summary = [
  '# Investigation controls (scripted, draft)',
  '',
  'Both strategies are authored algorithms using the same tools, rules and Pi runtime.',
  'Memory recovery failures are findings; expected-loss checks passing does not mean recovery succeeded.',
  '',
  '| Offers | Strategy | Storage | Restart | Outcome | Completed checks | Read attempts | Proposal writes | Control problems |',
  '|---|---|---|---|---|---|---|---|---|',
  ...observations.map(
    ({ scenario, restart, result, problems }) =>
      `| ${scenario.offers} | ${scenario.strategy} | ${scenario.storage} | ${restart} | ${result.resumeError ? 'CHECKPOINT_LOST' : result.status} | ${result.completedTools.filter((tool) => tool.tool === 'check_plan').length} | ${result.attempts.filter((attempt) => attempt.tool === 'get_case').length} | ${result.proposalEvents} | ${problems.join('; ') || 'none'} |`,
  ),
  '',
  'Completed checks come from the scripted controller transcript; attempt logs include interrupted calls.',
  'No autonomous reasoning, accuracy gain, labor saving or production safety conclusion follows.',
  '',
].join('\n')
writeFileSync(join(run, 'report.md'), summary)
process.stdout.write(`${summary}\nReport: ${join(run, 'report.json')}\n`)
process.exitCode = observations.some((observation) => observation.problems.length > 0) ? 1 : 0
