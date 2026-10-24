import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type PolicyParameters,
  type RuleConstraints,
  type RuleSet,
  type ValidationIssue,
  validateRuleSet,
} from '@durable-jev/rule-engine'
import { z } from 'zod'
import {
  type PolicyClause,
  type PolicyDocument,
  policyClauses,
  policyDocument,
} from './policy-clauses.js'

export interface RulePack {
  policyVersion: string
  ruleSet: RuleSet
  parameters: PolicyParameters
  /** The policy document the rules were authored from. */
  policy: PolicyDocument
  /** Each rule's defining text in the policy document, by rule id. */
  clauses: ReadonlyMap<string, PolicyClause>
}

export class RulePackError extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(
      `rule pack failed validation:\n${issues.map((issue) => `- ${issue.code} ${issue.ruleId ?? ''} ${issue.message}`).join('\n')}`,
    )
    this.name = 'RulePackError'
  }
}

const policyParametersSchema = z.object({
  policyVersion: z.string().min(1),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
})

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function loadRulePack(
  materialsDirectory: string,
  codeEvaluatorRefs: ReadonlySet<string>,
  constraints: RuleConstraints = {},
): RulePack {
  const policy = policyParametersSchema.parse(
    readJson(join(materialsDirectory, 'policy-parameters.json')),
  )
  const validation = validateRuleSet(readJson(join(materialsDirectory, 'rules.json')), {
    constraints,
    policyParameters: new Set(Object.keys(policy.parameters)),
    evaluatorRefs: codeEvaluatorRefs,
  })
  if (!validation.ruleSet) throw new RulePackError(validation.issues)
  const text = policyDocument(
    readFileSync(join(materialsDirectory, `${policy.policyVersion}.md`), 'utf8'),
  )
  return {
    policyVersion: policy.policyVersion,
    ruleSet: validation.ruleSet,
    parameters: policy.parameters,
    policy: text,
    clauses: policyClauses(text),
  }
}
