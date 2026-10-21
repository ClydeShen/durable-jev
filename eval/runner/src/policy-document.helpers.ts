import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Expression, RuleDefinition } from '@durable-jev/rule-engine'
import {
  loadPolicyParameters,
  loadRuleSetFile,
  materialsDirectory,
  readMaterial,
} from './materials.js'

const evaluatorLabels: Record<RuleDefinition['evaluator']['kind'], string> = {
  code: 'code',
  decisionTable: 'decision table',
  semantic: 'Jev',
  humanGate: 'human',
  combinator: 'combinator',
}

const roleLabels: Record<string, string> = {
  TRANSPORT_PLANNER: 'transport planner',
  COMPLIANCE_REVIEWER: 'compliance reviewer',
  QUALITY_REVIEWER: 'quality reviewer',
  COMMERCIAL_MANAGER: 'commercial manager',
  WAREHOUSE_OPERATOR: 'warehouse operator',
  DISPATCHER: 'dispatcher',
}

function describeExpression(expression: Expression): string {
  switch (expression.kind) {
    case 'ref':
      return expression.ruleId
    case 'and':
    case 'or':
      return `(${expression.operands.map(describeExpression).join(` ${expression.kind.toUpperCase()} `)})`
    case 'not':
      return `NOT ${describeExpression(expression.operand)}`
    case 'ifThen':
      return `IF ${describeExpression(expression.condition)} THEN ${describeExpression(expression.consequence)}`
    case 'allOf':
    case 'anyOf':
      return `${expression.kind === 'allOf' ? 'ALL' : 'ANY'}(${expression.scope}, ${describeExpression(expression.expression)})`
  }
}

const withoutOuterParentheses = (text: string) =>
  text.startsWith('(') && text.endsWith(')') ? text.slice(1, -1) : text

function prerequisitesOf(rule: RuleDefinition): string {
  if (rule.combiner) return withoutOuterParentheses(describeExpression(rule.combiner))
  return rule.dependsOn.join(', ') || '—'
}

function humanRoleOf(rule: RuleDefinition): string {
  if (!rule.humanGate) return '—'
  const role = roleLabels[rule.humanGate.requiredRole] ?? rule.humanGate.requiredRole
  return rule.evaluator.kind === 'humanGate' ? role : `review: ${role}`
}

export function renderPolicyDocument(input: {
  template: string
  rules: readonly RuleDefinition[]
  descriptions: Readonly<Record<string, string>>
  parameters: Readonly<Record<string, unknown>>
}): string {
  const undescribed = input.rules.filter((rule) => !input.descriptions[rule.ruleId])
  if (undescribed.length > 0) {
    throw new Error(`missing descriptions for ${undescribed.map((rule) => rule.ruleId).join(', ')}`)
  }
  const rulesTable = [
    '| Rule | Scope | Type | Requirement | Prerequisites / combination | Applies when | Human role |',
    '|---|---|---|---|---|---|---|',
    ...input.rules
      .map((rule) =>
        [
          rule.ruleId,
          rule.scope,
          evaluatorLabels[rule.evaluator.kind],
          input.descriptions[rule.ruleId],
          prerequisitesOf(rule),
          rule.appliesWhen ? describeExpression(rule.appliesWhen) : 'always',
          humanRoleOf(rule),
        ]
          .map((cell) => ` ${cell} `)
          .join('|'),
      )
      .map((row) => `|${row}|`),
  ].join('\n')
  const parametersTable = [
    '| Parameter | Value |',
    '|---|---|',
    ...Object.entries(input.parameters).map(([name, value]) => `| \`${name}\` | ${value} |`),
  ].join('\n')
  return input.template
    .replace('{{RULES_TABLE}}', rulesTable)
    .replace('{{PARAMETERS_TABLE}}', parametersTable)
}

export const policyDocumentPath = join(materialsDirectory, 'policy-v1.md')

export function renderCurrentPolicyDocument(): string {
  return renderPolicyDocument({
    template: readFileSync(join(materialsDirectory, 'policy-v1.template.md'), 'utf8'),
    rules: loadRuleSetFile().rules as RuleDefinition[],
    descriptions: readMaterial<Record<string, string>>('rule-descriptions.json'),
    parameters: loadPolicyParameters(),
  })
}

export function writePolicyDocument(): void {
  writeFileSync(policyDocumentPath, renderCurrentPolicyDocument())
}
