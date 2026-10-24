import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCaseCatalog, loadLogisticsRulePack } from '@durable-jev/logistics'
import { observePolicyChange, type PolicyObservation } from './policy-change.js'

if (process.env.MODEL_MODE === 'live') {
  throw new Error(
    'this characterization uses scripted judgements; live evaluation is a separate run',
  )
}

const root = fileURLToPath(new URL('../../../', import.meta.url))
const reports = join(root, 'var/reports')
mkdirSync(reports, { recursive: true })
const run = mkdtempSync(join(reports, 'policy-change-'))
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
  variants.push({
    name,
    directory,
    observations: await observePolicyChange(baseline, directory, sample),
  })
}

function fileHash(path: string): string {
  return createHash('sha256')
    .update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex')
}

function hashes(directory: string) {
  return Object.fromEntries(
    ['policy-v1.md', 'rules.json', 'policy-parameters.json'].map((name) => [
      name,
      fileHash(join(directory, name)),
    ]),
  )
}

const implementationFiles = [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./policy-change.js', import.meta.url)),
  join(root, 'packages/rule-engine/dist/evaluate-rule-graph.js'),
  join(root, 'packages/agent-core/dist/case-runtime.js'),
  join(root, 'packages/agent-core/dist/human-gate.js'),
  join(root, 'packages/human-tasks/dist/decide-human-task.js'),
  join(root, 'pnpm-lock.yaml'),
]

const report = {
  generatedAt: new Date().toISOString(),
  experiment: 'P1: draft R35 threshold change from NZD 500 to NZD 750',
  reviewStatus: 'draft',
  modelMode: 'scripted',
  scope: 'R35 observations in the commercial agent; no release, live authoring or blind-test claim',
  activationMechanism:
    'recreate CaseRuntime using the chosen pack and the same in-memory CaseStore',
  policyTextRevised: false,
  productionPolicyRouterImplemented: false,
  humanMinutes: null,
  preparationCostMeasured: false,
  latencyMeaning:
    'single local initialization/evaluation; excludes human work and production rollout',
  inputs: { baseline, candidate, sampleCaseId: sample.shipment.caseId },
  hashes: {
    baseline: hashes(baseline),
    candidate: hashes(candidate),
    versioned: hashes(versioned),
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
  'This is rule-level scripted characterization, not a reviewed policy, blind result or cost estimate.',
  'Activation is simulated by choosing a rule pack; no production version router is implemented.',
  '',
  ...variants.flatMap((variant) => [
    `## ${variant.name}`,
    '',
    '| Scenario | Extra cost (NZD) | Policy pack | Activation | Before | After | Open approvals | Prior task decision |',
    '|---|---|---|---|---|---|---|---|',
    ...variant.observations.map(row),
    '',
  ]),
  '',
  'Human effort and preparation cost are unmeasured. JSON includes the exact inputs and local timings.',
  '',
].join('\n')
writeFileSync(join(run, 'report.md'), summary)
process.stdout.write(`${summary}\nReport: ${join(run, 'report.json')}\n`)
