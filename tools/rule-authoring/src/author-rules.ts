import {
  type PolicyParameters,
  type RuleDefinition,
  type RuleSet,
  ruleDefinitionSchema,
  validateRuleSet,
} from '@durable-jev/rule-engine'
import {
  type AssistantMessage,
  type Context,
  type Models,
  type Tool,
  type ToolCall,
  Type,
} from '@earendil-works/pi-ai'
import { z } from 'zod'
import { type PolicySection, ruleIdsIn } from './policy-sections.js'

export interface AuthoringModel {
  models: Models
  provider: string
  modelId: string
}

export interface AuthoringRequest {
  section: PolicySection
  ruleSet: RuleSet
  parameters: PolicyParameters
  factsCatalog: string
  codeEvaluatorRefs: ReadonlySet<string>
}

interface AuthoringAttempt {
  issues: string[]
  durationMs: number
  inputTokens: number
  outputTokens: number
}

export interface AuthoringResult {
  rules: RuleDefinition[]
  accepted: boolean
  attempts: AuthoringAttempt[]
}

const submitRules: Tool = {
  name: 'submit_rules',
  description: 'Submit the rule definitions that implement the policy section',
  parameters: Type.Object({ rules: Type.Array(Type.Unknown()) }),
}

function systemPrompt(request: AuthoringRequest): string {
  const existing = request.ruleSet.rules.map(
    (rule) => `- ${rule.ruleId} (${rule.owner}, ${rule.scope}): ${rule.title}`,
  )
  return [
    'You turn a written shipment release policy into executable rule definitions for a rule engine.',
    'Answer only by calling submit_rules with one definition per rule of the section.',
    'Each definition must match this JSON schema:',
    JSON.stringify(z.toJSONSchema(ruleDefinitionSchema)),
    '',
    request.factsCatalog,
    '',
    'Rules that already exist (depend on them by id; keep their owner agents):',
    ...existing,
    '',
    `Policy parameters: ${Object.keys(request.parameters).join(', ')}`,
  ].join('\n')
}

function sectionPrompt(section: PolicySection): string {
  return [
    `Write the rule definitions for "${section.title}": ${ruleIdsIn(section.text).join(', ')}.`,
    '',
    section.text,
  ].join('\n')
}

function issueTexts(ruleSet: RuleSet, request: AuthoringRequest): string[] {
  return validateRuleSet(ruleSet, {
    policyParameters: new Set(Object.keys(request.parameters)),
    evaluatorRefs: request.codeEvaluatorRefs,
  }).issues.map((issue) => `${issue.code} ${issue.ruleId ?? ''} ${issue.message}`)
}

function check(
  submitted: unknown,
  request: AuthoringRequest,
): { rules: RuleDefinition[]; issues: string[] } {
  const entries = Array.isArray(submitted) ? submitted : []
  const parsed = entries.map((entry) => ruleDefinitionSchema.safeParse(entry))
  const rules = parsed.flatMap((result) => (result.success ? [result.data] : []))
  const schemaIssues = parsed.flatMap((result, index) =>
    result.success
      ? []
      : result.error.issues.map(
          (issue) => `rule ${index}: ${issue.path.join('.')} ${issue.message}`,
        ),
  )
  const proposedIds = new Set(rules.map((rule) => rule.ruleId))
  const merged = [
    ...request.ruleSet.rules.filter((rule) => !proposedIds.has(rule.ruleId)),
    ...rules,
  ]
  const baseline = new Set(issueTexts(request.ruleSet, request))
  const introduced = issueTexts({ ...request.ruleSet, rules: merged }, request).filter(
    (issue) => !baseline.has(issue),
  )
  const missing = ruleIdsIn(request.section.text)
    .filter((ruleId) => !proposedIds.has(ruleId))
    .map((ruleId) => `missing a definition for ${ruleId}`)
  return { rules, issues: [...schemaIssues, ...introduced, ...missing] }
}

function submittedRules(message: AssistantMessage): unknown {
  const call = message.content.find(
    (block): block is ToolCall => block.type === 'toolCall' && block.name === submitRules.name,
  )
  return call?.arguments.rules
}

export async function authorRules(
  request: AuthoringRequest,
  model: AuthoringModel,
  maxAttempts = 3,
): Promise<AuthoringResult> {
  const llm = model.models.getModel(model.provider, model.modelId)
  if (!llm) throw new Error(`unknown authoring model ${model.provider}/${model.modelId}`)
  const context: Context = {
    systemPrompt: systemPrompt(request),
    messages: [{ role: 'user', content: sectionPrompt(request.section), timestamp: Date.now() }],
    tools: [submitRules],
  }
  const attempts: AuthoringAttempt[] = []
  let rules: RuleDefinition[] = []
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = performance.now()
    const message = await model.models.complete(llm, context, {
      toolChoice: { type: 'function', function: { name: submitRules.name } },
      temperature: 0,
      maxTokens: 16_000,
      maxRetries: 0,
      timeoutMs: 180_000,
    })
    const checked = check(submittedRules(message), request)
    rules = checked.rules
    attempts.push({
      issues: checked.issues,
      durationMs: Math.round(performance.now() - startedAt),
      inputTokens: message.usage.input,
      outputTokens: message.usage.output,
    })
    if (checked.issues.length === 0) return { rules, accepted: true, attempts }
    const call = message.content.find((block): block is ToolCall => block.type === 'toolCall')
    context.messages.push(message)
    if (call) {
      context.messages.push({
        role: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        content: [
          {
            type: 'text',
            text: `Fix these issues and submit all rules again:\n${checked.issues.join('\n')}`,
          },
        ],
        isError: true,
        timestamp: Date.now(),
      })
    }
  }
  return { rules, accepted: false, attempts }
}
