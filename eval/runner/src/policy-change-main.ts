import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCaseCatalog, loadLogisticsRulePack } from '@durable-jev/logistics'
import { createExperimentDirectory, fileHash, packHashes } from './experiment-evidence.js'
import {
  observePolicyChange,
  type PolicyObservation,
  policyBoundaryProblems,
} from './policy-change.js'
import { observePolicyWorkflow } from './policy-workflow-runner.js'

if (process.env.MODEL_MODE === 'live') {
  throw new Error(
    'this characterization uses scripted judgements; live evaluation is a separate run',
  )
}

const root = fileURLToPath(new URL('../../../', import.meta.url))
const run = createExperimentDirectory(root, 'policy-change')
const baseline = join(run, 'baseline')
const candidate = join(run, 'candidate')
cpSync(join(root, 'eval/materials'), baseline, { recursive: true, errorOnExist: true })
cpSync(baseline, candidate, { recursive: true, errorOnExist: true })

const parametersFile = join(candidate, 'policy-parameters.json')
const parameters = JSON.parse(readFileSync(parametersFile, 'utf8')) as {
  parameters: Record<string, unknown>
}
const priorLimit = parameters.parameters.extraCostApprovalThresholdCents
if (priorLimit !== 50_000) throw new Error('P1 requires the recorded baseline threshold of NZD 500')
parameters.parameters.extraCostApprovalThresholdCents = 75_000
writeFileSync(parametersFile, `${JSON.stringify(parameters, null, 2)}\n`)
loadLogisticsRulePack(candidate)
const versioned = join(run, 'candidate-versioned')
cpSync(candidate, versioned, { recursive: true, errorOnExist: true })
const rulesFile = join(versioned, 'rules.json')
const rules = JSON.parse(readFileSync(rulesFile, 'utf8')) as {
  ruleSetVersion: string
  rules: { ruleId: string; version: string }[]
}
const changedRule = rules.rules.find((rule) => rule.ruleId === 'R35')
if (!changedRule) throw new Error('R35 is required for the versioned-policy experiment')
changedRule.version = `${changedRule.version}-p1`
rules.ruleSetVersion = `${rules.ruleSetVersion}-p1`
writeFileSync(rulesFile, `${JSON.stringify(rules, null, 2)}\n`)
loadLogisticsRulePack(versioned)
const sample = loadCaseCatalog(join(baseline, 'cases')).get('LOG-005')
if (!sample) throw new Error('LOG-005 is required for the P1 characterization')
const variants = []
for (const [name, directory] of [
  ['parameter-only', candidate],
  ['parameter-and-rule-version', versioned],
] as const) {
  const observations = await observePolicyChange(baseline, directory, sample)
  variants.push({
    name,
    directory,
    observations,
    boundaryProblems: policyBoundaryProblems(observations),
    workflow: observePolicyWorkflow(join(run, 'workflow', name), baseline, directory),
  })
  process.stdout.write(`Completed ${name}: rule boundaries and full workflow recovery\n`)
}

const implementationFiles = [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./policy-change.js', import.meta.url)),
  ...[
    'experiment-evidence',
    'policy-workflow',
    'policy-workflow-child',
    'policy-workflow-runner',
  ].map((name) => fileURLToPath(new URL(`./${name}.js`, import.meta.url))),
  join(root, 'packages/rule-engine/dist/evaluate-rule-graph.js'),
  join(root, 'packages/agent-core/dist/case-runtime.js'),
  join(root, 'packages/agent-core/dist/human-gate.js'),
  join(root, 'packages/logistics/dist/logistics-runtime.js'),
  join(root, 'packages/logistics/dist/dispatch.js'),
  join(root, 'packages/human-tasks/dist/decide-human-task.js'),
  join(root, 'pnpm-lock.yaml'),
]

const report = {
  generatedAt: new Date().toISOString(),
  experiment: 'P1: R35 threshold change from NZD 500 to NZD 750',
  reviewStatus: 'draft',
  mutationReview: { status: 'owner-approved', date: '2026-10-24', comparison: 'strictly greater' },
  fixtureReviewStatus: sample.reviewStatus,
  modelMode: 'scripted',
  baselineRef: 'baseline-2026-10-24-r2',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }),
  scope:
    'R35 characterization and full logistics continuity; no live authoring or blind-test claim',
  activationMechanism:
    'explicit pack choice; rule probe uses memory, workflow reopens file-backed agent stores',
  recoveryMechanism: 'process.exit(137) before/after propagation; SQLite recovery, not Pi',
  policyTextRevised: false,
  productionPolicyRouterImplemented: false,
  humanMinutes: null,
  preparationCostMeasured: false,
  latencyMeaning:
    'rule initialization/evaluation; workflow executionMs/resumeMs include child startup; not human effort or a latency benchmark',
  inputs: { baseline, candidate, sampleCaseId: sample.shipment.caseId },
  hashes: {
    baseline: packHashes(baseline),
    candidate: packHashes(candidate),
    versioned: packHashes(versioned),
  },
  implementationHashes: Object.fromEntries(
    implementationFiles.map((path) => [relative(root, path).replaceAll('\\', '/'), fileHash(path)]),
  ),
  variants,
}
writeFileSync(join(run, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

function row(item: PolicyObservation): string {
  return `| ${item.scenario} | ${item.extraCostCents / 100} | ${item.policyPack} | ${item.activation} | ${item.before?.status ?? '—'} | ${item.after.status} | ${item.after.openApprovals} | ${item.priorTaskDecision ?? '—'} |`
}

const summary = [
  '# Policy change characterization (draft)',
  '',
  'P1 changes the R35 threshold in isolated copies; one variant also increments rule versions.',
  'The copied policy text is unchanged in both variants.',
  'The owner approved the P1 threshold semantics; wider demo labels remain draft.',
  'This is scripted rule and full-flow characterization, not blind evidence or a cost estimate.',
  'Activation is simulated by choosing a rule pack; no production version router is implemented.',
  '',
  ...variants.flatMap((variant) => [
    `## ${variant.name}`,
    '',
    '| Scenario | Extra cost (NZD) | Policy pack | Activation | Before | After | Open approvals | Prior task decision |',
    '|---|---|---|---|---|---|---|---|',
    ...variant.observations.map(row),
    `Boundary problems: ${variant.boundaryProblems.join('; ') || 'none'}.`,
    '',
    '### Full workflow and process recovery',
    '',
    '| Activation | NZD | Initially approved | R35 after change | Open approvals | Prior decision | Further approvals | Recovery/control problems |',
    '|---|---|---|---|---|---|---|---|',
    ...variant.workflow.map(
      ({ scenario, observations, recovery }) =>
        `| ${scenario.activation} | ${scenario.extraCostCents / 100} | ${scenario.approved} | ${observations.r35} | ${observations.openApprovals} | ${observations.priorTaskDecision ?? '—'} | ${observations.additionalApprovals} | ${recovery.flatMap((entry) => entry.problems).join('; ') || 'none'} |`,
    ),
    '',
  ]),
  '',
  'Human effort and preparation cost are unmeasured. JSON includes the exact inputs and local timings.',
  '',
].join('\n')
writeFileSync(join(run, 'report.md'), summary)
process.stdout.write(`${summary}\nReport: ${join(run, 'report.json')}\n`)
process.exitCode = variants.some(
  (variant) =>
    variant.boundaryProblems.length > 0 ||
    variant.workflow.some((workflow) =>
      workflow.recovery.some((entry) => entry.problems.length > 0),
    ),
)
  ? 1
  : 0
