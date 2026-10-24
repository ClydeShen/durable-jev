import { cpSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertPackHashes,
  createExperimentDirectory,
  fileHash,
  packHashes,
  sourceRevision,
  writeEvidence,
} from './experiment-evidence.js'
import { type GateScenario, observeGateChange } from './gate-change.js'
import { prepareGatePack, rehearseGateAuthoring } from './gate-change-packs.js'

if (process.env.MODEL_MODE === 'live') throw new Error('gate characterization is scripted only')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const source = join(root, 'eval/materials')
const sourceHashes = packHashes(source)
const run = createExperimentDirectory(root, 'gate-change')
const baseline = join(run, 'baseline')
cpSync(source, baseline, { recursive: true, errorOnExist: true })
const provenance = {
  ...sourceRevision(root),
  implementationHashes: Object.fromEntries(
    [
      'eval/runner/dist/gate-change.js',
      'eval/runner/dist/gate-change-packs.js',
      'eval/runner/dist/gate-change-main.js',
      'eval/runner/dist/experiment-evidence.js',
      'eval/runner/dist/faults/lab.js',
      'tools/rule-authoring/dist/main.js',
      'tools/rule-authoring/dist/author-rules.js',
      'tools/rule-authoring/dist/policy-sections.js',
      'tools/rule-authoring/dist/rule-diff.js',
      'pnpm-lock.yaml',
    ].map((path) => [path, fileHash(join(root, path))]),
  ),
}
writeEvidence(join(run, 'plan.json'), {
  ...provenance,
  sourceHashes,
  mutations: ['P2', 'P3'],
  variants: ['same-version', 'new-version'],
})
const variants = []
for (const mutation of ['P2', 'P3'] as const) {
  for (const variant of ['same-version', 'new-version'] as const) {
    const candidate = join(run, `${mutation}-${variant}`)
    prepareGatePack(baseline, candidate, mutation, variant === 'new-version')
    const hashes = packHashes(candidate)
    const observations = []
    for (const activation of ['pinned', 're-evaluate', 'new-case', 'unaffected'] as const) {
      const initialStates =
        activation === 'pinned' || activation === 're-evaluate' ? [false, true] : [false]
      for (const completed of initialStates) {
        const scenario: GateScenario = { mutation, variant, activation, completed }
        const directory = join(run, 'runs', `${mutation}-${variant}-${activation}-${completed}`)
        const observation = await observeGateChange(scenario, baseline, candidate, directory)
        writeEvidence(join(directory, 'observation.json'), observation)
        observations.push(observation)
      }
    }
    const authoring =
      variant === 'new-version'
        ? rehearseGateAuthoring(
            root,
            join(run, `authoring-${mutation}`),
            baseline,
            candidate,
            mutation,
          )
        : undefined
    assertPackHashes(candidate, hashes)
    variants.push({ mutation, variant, candidate, hashes, observations, authoring })
    process.stdout.write(`${mutation} ${variant}: ${observations.length} gate observations\n`)
  }
}
assertPackHashes(source, sourceHashes)
assertPackHashes(baseline, sourceHashes)
const problems = variants.flatMap((variant) =>
  variant.observations.flatMap((item) => item.problems),
)
writeEvidence(join(run, 'report.json'), {
  generatedAt: new Date().toISOString(),
  baselineRef: 'baseline-2026-10-24-r2',
  ...provenance,
  reviewStatus: 'draft',
  mutationReview: { status: 'owner-approved', date: '2026-10-24' },
  fixtureReviewStatus: 'draft',
  modelMode: 'scripted',
  sourceHashes,
  scope:
    'human-gate migration and authoring CLI rehearsal; no full release, crash, live-model, blind-test or cost claim',
  activationMechanism: 'explicit pack selection followed by propagation; no production router',
  recoveryMechanism: 'close and reopen all five agent SQLite stores; not Pi or process termination',
  humanMinutes: null,
  preparationCostMeasured: false,
  variants,
  problems,
})
const summary = [
  '# Approval and evidence migration (draft evidence)',
  '',
  'Owner-approved P2: all controlled items require compliance then distinct quality approval.',
  'Owner-approved P3: repacking additionally requires inspectionReportRef.',
  'Synthetic cases and scripted judgments; authoring recordings come from the manual candidate.',
  '',
  '| Mutation | Variant | Activation | Initially completed | After migration | Further actions | Missing report | Problems |',
  '|---|---|---|---|---|---|---|---|',
  ...variants.flatMap((variant) =>
    variant.observations.map(
      (item) =>
        `| ${variant.mutation} | ${variant.variant} | ${item.scenario.activation} | ${item.scenario.completed} | ${item.after.outcomes.map((outcome) => outcome.status).join(', ')} | ${item.decisions.length} | ${
          item.decisions
            .map((decision) => decision.missingReport)
            .filter(Boolean)
            .join(', ') || '—'
        } | ${item.problems.join('; ') || 'none'} |`,
    ),
  ),
  '',
  'Passing characterization checks do not make same-version migrations safe. Inspect each observation.',
  'Human effort is unknown. The proposal/repair/application path is rehearsed, not independently authored.',
  '',
].join('\n')
writeFileSync(join(run, 'report.md'), summary)
process.stdout.write(`${summary}\nReport: ${join(run, 'report.json')}\n`)
process.exitCode = problems.length > 0 ? 1 : 0
