import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadLogisticsRulePack } from '@durable-jev/logistics'
import { JevJudge, ScriptedJudge } from '@durable-jev/model-providers'
import { loadScreeningSamples, screenSample, scriptedAnswers } from './screening.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const materials = join(repositoryRoot, 'eval/materials')
const reportDirectory = join(repositoryRoot, 'var/reports')
const live = process.env.MODEL_MODE === 'live'

const rulePack = loadLogisticsRulePack(materials)
const classifierId = rulePack.ruleSet.selection?.classifierRuleId ?? ''
const liveJudge = live ? new JevJudge() : undefined
const results = []
for (const sample of loadScreeningSamples(join(materials, 'screening/samples.json'))) {
  const judge = liveJudge ?? new ScriptedJudge(scriptedAnswers(sample, classifierId))
  results.push(await screenSample(sample, rulePack, judge))
}

const missed = results.filter((result) => result.missed.length > 0)
const widened = results.filter((result) => result.extra.length > 0)
const lines = [
  `# Rule screening (${live ? 'live Jev' : 'scripted answers'})`,
  '',
  '| Sample | Groups | Selected | Filtered | Missed | Extra |',
  '|---|---|---|---|---|---|',
  ...results.map(
    (result) =>
      `| ${result.sampleId} | ${result.selectedGroups.join(', ')} | ${result.selectedRules} | ${result.filteredRules} | ${result.missed.join(', ') || '-'} | ${result.extra.length} |`,
  ),
  '',
  `${results.length} samples, ${missed.length} with missed rules, ${widened.length} selected extra rules.`,
]
mkdirSync(reportDirectory, { recursive: true })
writeFileSync(
  join(reportDirectory, `screening-${live ? 'live' : 'scripted'}.md`),
  `${lines.join('\n')}\n`,
)
process.stdout.write(`${lines.join('\n')}\n`)
process.exitCode = missed.length === 0 ? 0 : 1
