import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRulePack } from '@durable-jev/agent-core'
import { createModels, type JsonValue } from '@earendil-works/pi-ai'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import { nvidiaProvider } from '@earendil-works/pi-ai/providers/nvidia'
import { type AuthoringModel, authorRules } from './author-rules.js'
import { policySections } from './policy-sections.js'
import { diffRules } from './rule-diff.js'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const materials = join(repositoryRoot, 'eval/materials')
const proposalsDirectory = join(repositoryRoot, 'var/authoring')
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
  const section = policySections(readFileSync(join(materials, 'policy-v1.md'), 'utf8')).find(
    (candidate) => candidate.title.startsWith(sectionPrefix),
  )
  if (!section) throw new Error(`no policy section starting with "${sectionPrefix}"`)
  const pack = loadRulePack(materials, codeEvaluatorRefs)
  const live = process.env.MODEL_MODE === 'live'
  const model = live ? liveModel() : scriptedModel(slugOf(section.title))
  const result = await authorRules(
    {
      section,
      ruleSet: pack.ruleSet,
      parameters: pack.parameters,
      factsCatalog: readFileSync(join(materials, 'facts-catalog.md'), 'utf8'),
      codeEvaluatorRefs,
    },
    model,
  )
  const proposal = {
    section: section.title,
    generatedAt: new Date().toISOString(),
    mode: live ? 'live' : 'scripted',
    model: `${model.provider}/${model.modelId}`,
    accepted: result.accepted,
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
        ? `proposal: ${path}\napply after review: pnpm author --apply ${path}`
        : 'proposal rejected by validation',
      '',
    ].join('\n'),
  )
  process.exitCode = proposal.accepted ? 0 : 1
}

function apply(proposalPath: string) {
  const proposal = JSON.parse(readFileSync(proposalPath, 'utf8')) as {
    accepted: boolean
    rules: { ruleId: string }[]
  }
  if (!proposal.accepted) throw new Error('only accepted proposals can be applied')
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
  writeFileSync(rulesPath, `${JSON.stringify(updated, null, 2)}\n`)
  try {
    loadRulePack(materials, codeEvaluatorRefs)
  } catch (error) {
    writeFileSync(rulesPath, previous)
    throw error
  }
  execFileSync('npx', ['biome', 'format', '--write', rulesPath], {
    cwd: repositoryRoot,
    stdio: 'ignore',
  })
  process.stdout.write(`applied ${proposal.rules.length} rules to ${rulesPath}\n`)
}

const [first, second] = process.argv.slice(2)
if (first === '--apply' && second) apply(second)
else if (first) await propose(first)
else
  process.stderr.write(
    'usage: pnpm author "<policy section, e.g. Part A>" | pnpm author --apply <proposal.json>\n',
  )
