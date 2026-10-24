import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalJson } from '@durable-jev/contracts'
import { loadLogisticsRulePack } from '@durable-jev/logistics'
import type { RuleSet } from '@durable-jev/rule-engine'
import { writeEvidence } from './experiment-evidence.js'
import type { GateScenario } from './gate-change.js'

const policyText = {
  P2: '**R13 Compliance sign-off.** Applies to: each controlled cargo item. Prerequisites: R10, R11 and R12. A compliance reviewer must approve the item for the current cargo, carrier and route versions. A quality reviewer must then approve every controlled item, whether or not it is cold chain. The two approvals must be given by different people. Approvals expire after `approvalExpiryHours`.',
  P3: '**R21 Repacked.** Applies to: each cold-chain cargo item, only when R18 does not pass. A warehouse operator must repack the item and record the new packaging id, a photo reference and an inspection report reference (`inspectionReportRef`).',
}

export function prepareGatePack(
  baseline: string,
  candidate: string,
  mutation: GateScenario['mutation'],
  versioned: boolean,
) {
  cpSync(baseline, candidate, { recursive: true, errorOnExist: true })
  const rulesPath = join(candidate, 'rules.json')
  const rules = JSON.parse(readFileSync(rulesPath, 'utf8')) as RuleSet
  const ruleId = mutation === 'P2' ? 'R13' : 'R21'
  const rule = rules.rules.find((entry) => entry.ruleId === ruleId)
  if (!rule?.humanGate) throw new Error(`missing ${ruleId} gate`)
  if (mutation === 'P2') {
    const second = rule.humanGate.steps[1]
    if (!second?.appliesWhen) throw new Error('P2 requires the original conditional second step')
    delete second.appliesWhen
  } else {
    if (rule.humanGate.evidenceRequirements.includes('inspectionReportRef'))
      throw new Error('P3 requires the original evidence fields')
    rule.humanGate.evidenceRequirements.push('inspectionReportRef')
  }
  if (versioned) rule.version = `${rule.version}-${mutation.toLowerCase()}`
  writeEvidence(rulesPath, rules)
  const policyPath = join(candidate, 'policy-v1.md')
  const policy = readFileSync(policyPath, 'utf8')
  const paragraph = new RegExp(`^\\*\\*${ruleId} [^\\n]+`, 'm')
  if (!paragraph.test(policy)) throw new Error(`missing ${ruleId} policy paragraph`)
  writeFileSync(policyPath, policy.replace(paragraph, policyText[mutation]))
  loadLogisticsRulePack(candidate)
}

/** Synthesized recordings exercise validation and application, not independent rule generation. */
export function rehearseGateAuthoring(
  root: string,
  directory: string,
  baseline: string,
  candidate: string,
  mutation: GateScenario['mutation'],
) {
  const input = join(directory, 'input')
  const output = join(directory, 'proposals')
  cpSync(baseline, input, { recursive: true, errorOnExist: true })
  cpSync(join(candidate, 'policy-v1.md'), join(input, 'policy-v1.md'))
  const ruleId = mutation === 'P2' ? 'R13' : 'R21'
  const pack = loadLogisticsRulePack(candidate)
  const proposed = pack.ruleSet.rules.find((rule) => rule.ruleId === ruleId)
  const prior = loadLogisticsRulePack(baseline).ruleSet.rules.find((rule) => rule.ruleId === ruleId)
  if (!proposed || !prior) throw new Error(`missing ${ruleId}`)
  mkdirSync(join(input, 'authoring'), { recursive: true })
  writeEvidence(join(input, 'authoring', `rule-${ruleId.toLowerCase()}.json`), {
    provenance:
      'synthetic recording copied from the manual candidate; not model-generated evidence',
    attempts: [{ rules: [{ ...proposed, version: prior.version }] }, { rules: [proposed] }],
  })
  runAuthor(root, directory, 'propose', ['--materials', input, '--output', output, ruleId])
  const proposals = readdirSync(output).filter((name) => name.endsWith('.json'))
  if (proposals.length !== 1) throw new Error('expected one proposal receipt')
  const proposal = join(output, proposals[0] as string)
  const receipt = JSON.parse(readFileSync(proposal, 'utf8')) as {
    accepted: boolean
    attempts: { issues: string[] }[]
  }
  if (
    !receipt.accepted ||
    receipt.attempts.length !== 2 ||
    !receipt.attempts[0]?.issues.includes(`changed rule ${ruleId} needs a new version`)
  )
    throw new Error('expected a recorded unversioned rejection followed by a valid proposal')
  const refused = runAuthor(
    root,
    directory,
    'wrong-pack',
    ['--materials', candidate, '--apply', proposal],
    1,
  )
  if (!refused.includes('proposal belongs to another materials directory'))
    throw new Error('expected a material-directory refusal before application')
  runAuthor(root, directory, 'apply', ['--materials', input, '--apply', proposal])
  if (canonicalJson(loadLogisticsRulePack(input).ruleSet) !== canonicalJson(pack.ruleSet))
    throw new Error('applied authoring rehearsal differs from the manual candidate')
  return {
    proposal,
    mode: 'scripted',
    provenance: 'manual-candidate recording',
    independentComparison: false,
    humanMinutes: null,
    receipt,
  }
}

function runAuthor(
  root: string,
  directory: string,
  phase: string,
  args: string[],
  expectedCode = 0,
) {
  const result = spawnSync(
    process.execPath,
    [join(root, 'tools/rule-authoring/dist/main.js'), ...args],
    {
      cwd: root,
      env: { ...process.env, MODEL_MODE: 'scripted' },
      encoding: 'utf8',
      timeout: 30_000,
    },
  )
  writeFileSync(join(directory, `${phase}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`)
  if (result.error || result.status !== expectedCode)
    throw new Error(`authoring ${phase} failed: ${result.error ?? result.stderr}`)
  return result.stderr
}
