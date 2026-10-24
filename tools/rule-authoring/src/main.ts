import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadRulePack } from '@durable-jev/agent-core'
import { logisticsRuleConstraints } from '@durable-jev/logistics'
import { createModels, type JsonValue } from '@earendil-works/pi-ai'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { nvidiaProvider } from '@earendil-works/pi-ai/providers/nvidia'
import { type AuthoringModel, authorRules } from './author-rules.js'
import { selectPolicy } from './policy-sections.js'
import { diffRules } from './rule-diff.js'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const argumentsOf = parseArgs({
  allowPositionals: true,
  options: {
    materials: { type: 'string' },
    output: { type: 'string' },
    apply: { type: 'boolean' },
  },
})
const materials = resolve(argumentsOf.values.materials ?? join(repositoryRoot, 'eval/materials'))
const proposalsDirectory = resolve(
  argumentsOf.values.output ?? join(repositoryRoot, 'var/authoring'),
)
const codeEvaluatorRefs = new Set(['R29'])
const slugOf = (title: string) =>
  title.split('.')[0]?.trim().toLowerCase().replace(/\s+/g, '-') ?? 'section'

function scriptedModel(slug: string): AuthoringModel {
  const recording = join(materials, 'authoring', `${slug}.json`)
  if (!existsSync(recording))
    throw new Error(`no scripted authoring recording ${recording}; use MODEL_MODE=live`)
  const { attempts } = JSON.parse(readFileSync(recording, 'utf8')) as {
    attempts: { rules: JsonValue[] }[]
  }
  const faux = fauxProvider({ provider: 'scripted-authoring', models: [{ id: 'recorded' }] })
  faux.setResponses(
    attempts.map((attempt) =>
      fauxAssistantMessage(fauxToolCall('submit_rules', { rules: attempt.rules }), {
        stopReason: 'toolUse',
      }),
    ),
  )
  const models = createModels()
  models.setProvider(faux.provider)
  return { models, provider: 'scripted-authoring', modelId: 'recorded' }
}

function liveModel(): AuthoringModel {
  const models = createModels()
  models.setProvider(nvidiaProvider())
  return {
    models,
    provider: 'nvidia',
    modelId: process.env.AUTHORING_MODEL ?? 'nvidia/nemotron-3.5-super-vl-120b-a12b',
  }
}

async function propose(sectionPrefix: string) {
  const section = selectPolicy(readFileSync(join(materials, 'policy-v1.md'), 'utf8'), sectionPrefix)
  const pack = loadRulePack(materials, codeEvaluatorRefs, logisticsRuleConstraints)
  const live = process.env.MODEL_MODE === 'live'
  const model = live ? liveModel() : scriptedModel(slugOf(section.title))
  const factsCatalog = readFileSync(join(materials, 'facts-catalog.md'), 'utf8')
  const result = await authorRules(
    {
      section,
      ruleSet: pack.ruleSet,
      parameters: pack.parameters,
      factsCatalog,
      codeEvaluatorRefs,
      constraints: logisticsRuleConstraints,
    },
    model,
  )
  const proposal = {
    section: section.title,
    generatedAt: new Date().toISOString(),
    mode: live ? 'live' : 'scripted',
    model: `${model.provider}/${model.modelId}`,
    tokenUsageMeaning: live
      ? 'provider-reported usage; not a price quote'
      : 'faux-provider estimates; no live model usage or billing',
    accepted: result.accepted,
    reviewStatus: 'pending',
    acceptanceMeaning:
      'schema, scope and version validation only; business review is still required',
    materialsDirectory: materials,
    input: {
      section,
      ruleSet: pack.ruleSet,
      parameters: pack.parameters,
      factsCatalog,
      constraints: logisticsRuleConstraints,
      codeEvaluatorRefs: [...codeEvaluatorRefs],
    },
    diff: diffRules(pack.ruleSet.rules, result.rules),
    attempts: result.attempts,
    rules: result.rules,
  }
  mkdirSync(proposalsDirectory, { recursive: true })
  const path = join(proposalsDirectory, `${slugOf(section.title)}-${Date.now()}.json`)
  writeFileSync(path, `${JSON.stringify(proposal, null, 2)}\n`)
  process.stdout.write(
    [
      `section: ${proposal.section} (${proposal.mode}, ${proposal.model})`,
      ...result.attempts.map(
        (attempt, index) =>
          `attempt ${index + 1}: ${attempt.issues.length === 0 ? 'valid' : attempt.issues.join('; ')} (${attempt.durationMs} ms, ${attempt.inputTokens}+${attempt.outputTokens} tokens)`,
      ),
      `diff: added ${proposal.diff.added.join(', ') || '-'}; changed ${proposal.diff.changed.join(', ') || '-'}; unchanged ${proposal.diff.unchanged.length}`,
      proposal.accepted
        ? `proposal: ${path}\napply after review: pnpm author --materials ${JSON.stringify(materials)} --apply ${JSON.stringify(path)}`
        : `proposal rejected by validation: ${path}`,
      '',
    ].join('\n'),
  )
  process.exitCode = proposal.accepted ? 0 : 1
}

function apply(proposalPath: string) {
  const proposal = JSON.parse(readFileSync(proposalPath, 'utf8')) as {
    accepted: boolean
    materialsDirectory?: string
    rules: { ruleId: string }[]
  }
  if (!proposal.accepted) throw new Error('only accepted proposals can be applied')
  if (proposal.materialsDirectory && resolve(proposal.materialsDirectory) !== materials)
    throw new Error('proposal belongs to another materials directory; select it explicitly')
  const rulesPath = join(materials, 'rules.json')
  const ruleSet = JSON.parse(readFileSync(rulesPath, 'utf8')) as { rules: { ruleId: string }[] }
  const proposed = new Map(proposal.rules.map((rule) => [rule.ruleId, rule]))
  const updated = {
    ...ruleSet,
    rules: [
      ...ruleSet.rules.map((rule) => proposed.get(rule.ruleId) ?? rule),
      ...proposal.rules.filter(
        (rule) => !ruleSet.rules.some((existing) => existing.ruleId === rule.ruleId),
      ),
    ],
  }
  const previous = readFileSync(rulesPath, 'utf8')
  const formatted = execFileSync(
    process.execPath,
    [
      join(repositoryRoot, 'node_modules/@biomejs/biome/bin/biome'),
      'format',
      '--stdin-file-path',
      'rules.json',
    ],
    { cwd: repositoryRoot, input: JSON.stringify(updated), encoding: 'utf8' },
  )
  writeFileSync(rulesPath, formatted)
  try {
    loadRulePack(materials, codeEvaluatorRefs, logisticsRuleConstraints)
  } catch (error) {
    writeFileSync(rulesPath, previous)
    throw error
  }
  process.stdout.write(`applied ${proposal.rules.length} rules to ${rulesPath}\n`)
}

const [first] = argumentsOf.positionals
if (argumentsOf.values.apply && first) apply(first)
else if (first) await propose(first)
else
  process.stderr.write(
    'usage: pnpm author [--materials <directory>] [--output <directory>] "<rule or section>" | pnpm author --apply <proposal.json> [--materials <directory>]\n',
  )
