// Records schema boundaries before migration work; acceptance is not business correctness.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ruleDefinitionSchema } from '../packages/rule-engine/src/index.ts'

const root = new URL('../', import.meta.url)
const sourceFiles = [
  'scripts/portability-probe.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'packages/rule-engine/src/rule-definition.ts',
  'packages/rule-engine/src/facts.ts',
  'packages/rule-engine/src/feel.ts',
  'packages/rule-engine/src/rule-selection.ts',
  'packages/contracts/src/agents.ts',
  'packages/contracts/src/statuses.ts',
  'packages/contracts/src/check.ts',
  'packages/contracts/src/ids.ts',
  'packages/contracts/src/shipment.ts',
  'packages/agent-core/src/rule-pack.ts',
  'packages/agent-core/src/case-runtime.ts',
  'packages/agent-core/src/case-store.ts',
  'packages/agent-core/src/human-gate.ts',
  'tools/rule-authoring/src/author-rules.ts',
]

const baseline = {
  ruleId: 'PROBE-001',
  version: '1',
  title: 'Record amount limit',
  owner: 'order-coordination',
  scope: 'order',
  dependsOn: [],
  evaluator: { kind: 'expression', ref: 'PROBE-001' },
  expression: { passWhen: 'order.amount <= params.limit' },
  unknownPolicy: 'block',
  inputPaths: ['order.amount'],
  parameters: ['limit'],
  invalidationTriggers: [],
}

function inspect(name, patch) {
  const parsed = ruleDefinitionSchema.safeParse({ ...baseline, ...patch })
  const issues = parsed.success
    ? []
    : parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }))
  const suppliedKeys = Object.keys(patch.applicability ?? {})
  const retainedKeys = Object.keys(parsed.success ? (parsed.data.applicability ?? {}) : {})
  return {
    name,
    patch,
    accepted: parsed.success,
    issues,
    ignoredApplicabilityKeys: parsed.success
      ? suppliedKeys.filter((key) => !retainedKeys.includes(key))
      : [],
    ...(parsed.success ? { parsedRule: parsed.data } : {}),
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  evidenceType: 'schema compatibility probe; not execution, accuracy or migration cost evidence',
  sourceHashes: Object.fromEntries(
    sourceFiles.map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n'))
        .digest('hex'),
    ]),
  ),
  observations: [
    inspect('Different expression in the existing logistics envelope', {}),
    inspect('New agent identity', { owner: 'policy-review' }),
    inspect('New business scope', { scope: 'record' }),
    inspect('New invalidation dimension', { invalidationTriggers: ['applicant'] }),
    inspect('New applicability dimension', { applicability: { riskLevels: ['high'] } }),
    inspect('New approval role', {
      evaluator: { kind: 'humanGate', ref: 'PROBE-001' },
      expression: undefined,
      humanGate: {
        taskType: 'APPROVAL',
        steps: [{ requiredRole: 'policyReviewer' }],
        mode: 'sequential',
        distinctActors: false,
        evidenceRequirements: [],
        expiresAfterHours: 24,
      },
    }),
  ],
}

const reports = new URL('var/reports/', root)
mkdirSync(reports, { recursive: true })
const output = new URL('portability-baseline.json', reports)
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
for (const observation of report.observations) {
  const ignored = observation.ignoredApplicabilityKeys
  const warning = ignored.length > 0 ? `; discarded applicability keys: ${ignored.join(', ')}` : ''
  process.stdout.write(
    `${observation.name}: ${observation.accepted ? 'schema accepted' : 'schema rejected'}${warning}\n`,
  )
}
process.stdout.write(
  `Schema probes only; no execution or migration cost claim.\nReport: ${fileURLToPath(output)}\n`,
)
