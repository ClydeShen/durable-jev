import type { RuleEngineKind } from '@durable-jev/contracts'
import {
  type CheckScope,
  type CheckStatus,
  isPendingCheckStatus,
  type RuleId,
} from '@durable-jev/contracts'
import { combineAllOf, type Outcome, outcome } from './combinators.js'
import { type ExpressionContext, evaluateExpression } from './evaluate-expression.js'
import type { CollectionScope } from './expression.js'
import { evaluateFeel, feelContext, type PolicyParameters, statusOfPredicate } from './feel.js'
import { ruleInputFingerprint } from './fingerprint.js'
import type { InvalidationTrigger, RuleDefinition, RuleScope, RuleSet } from './rule-definition.js'
import { referencedRules } from './validate-rule-set.js'

export type Facts = Record<string, unknown>

export interface CaseFacts {
  entityVersions: Partial<Record<InvalidationTrigger, number>>
  order: Facts
  cargoItems: { cargoItemId: string; facts: Facts }[]
  legs: { legId: string; facts: Facts }[]
}

export interface LeafEvaluation {
  status: CheckStatus
  observedValue?: unknown
}

export interface LeafInput {
  rule: RuleDefinition
  scope: CheckScope
  facts: CaseFacts
  scopeFacts: Facts
  parameters: PolicyParameters
  resultOf(ruleId: RuleId): RuleOutcome | undefined
}

export type LeafEvaluator = (input: LeafInput) => LeafEvaluation | Promise<LeafEvaluation>

export interface RuleOutcome {
  ruleId: RuleId
  scope: CheckScope
  status: CheckStatus
  observedValue?: unknown
  blockedBy: RuleId[]
  inputFingerprint: string
  reused?: boolean
  invalidatedBy?: string
  error?: string
}

export interface EvaluationEnvironment {
  evaluators: ReadonlyMap<string, LeafEvaluator>
  parameters: PolicyParameters
}

export interface EvaluationOptions {
  previous?: readonly RuleOutcome[]
  reusableKinds?: readonly RuleEngineKind[]
}

export interface RuleGraphEvaluation {
  outcomes: RuleOutcome[]
  escalations: { ruleId: RuleId; scope: CheckScope }[]
  outcomeOf(ruleId: RuleId, scope?: CheckScope): RuleOutcome | undefined
}

export function scopeKey(scope: CheckScope): string {
  if (scope.kind === 'cargoItem') return `cargoItem:${scope.cargoItemId}`
  if (scope.kind === 'leg') return `leg:${scope.legId}`
  return 'order'
}

function membersOf(facts: CaseFacts, scope: RuleScope): CheckScope[] {
  if (scope === 'cargoItem') {
    return facts.cargoItems.map(({ cargoItemId }) => ({ kind: 'cargoItem', cargoItemId }))
  }
  if (scope === 'leg') return facts.legs.map(({ legId }) => ({ kind: 'leg', legId }))
  return [{ kind: 'order' }]
}

function factsOf(facts: CaseFacts, scope: CheckScope): Facts {
  if (scope.kind === 'cargoItem') {
    return facts.cargoItems.find((item) => item.cargoItemId === scope.cargoItemId)?.facts ?? {}
  }
  if (scope.kind === 'leg') return facts.legs.find((leg) => leg.legId === scope.legId)?.facts ?? {}
  return facts.order
}

function readPath(source: Facts, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value !== null && typeof value === 'object' ? (value as Facts)[key] : undefined,
      source,
    )
}

export function topologicalOrder(rules: readonly RuleDefinition[]): RuleDefinition[] {
  const byId = new Map(rules.map((rule) => [rule.ruleId, rule]))
  const ordered: RuleDefinition[] = []
  const visited = new Set<RuleId>()
  const visit = (rule: RuleDefinition) => {
    if (visited.has(rule.ruleId)) return
    visited.add(rule.ruleId)
    for (const dependency of rule.dependsOn) {
      const upstream = byId.get(dependency)
      if (upstream) visit(upstream)
    }
    ordered.push(rule)
  }
  for (const rule of rules) visit(rule)
  return ordered
}

class GraphState implements ExpressionContext {
  private readonly results = new Map<string, RuleOutcome>()
  private readonly scopeOfRule: ReadonlyMap<RuleId, RuleScope>

  constructor(
    rules: readonly RuleDefinition[],
    readonly facts: CaseFacts,
  ) {
    this.scopeOfRule = new Map(rules.map((rule) => [rule.ruleId, rule.scope]))
  }

  record(result: RuleOutcome) {
    this.results.set(`${result.ruleId}@${scopeKey(result.scope)}`, result)
  }

  all(): RuleOutcome[] {
    return [...this.results.values()]
  }

  resultOf(ruleId: RuleId, scope: CheckScope): RuleOutcome | undefined {
    const target = this.scopeOfRule.get(ruleId)
    const resolved: CheckScope = target === 'order' ? { kind: 'order' } : scope
    if (target !== 'order' && target !== scope.kind) return undefined
    return this.results.get(`${ruleId}@${scopeKey(resolved)}`)
  }

  statusOf(ruleId: RuleId, scope: CheckScope): CheckStatus {
    return this.resultOf(ruleId, scope)?.status ?? 'UNKNOWN'
  }

  observedValueOf(ruleId: RuleId, scope: CheckScope): unknown {
    return this.resultOf(ruleId, scope)?.observedValue
  }

  factOf(path: string, scope: CheckScope): unknown {
    if (path.startsWith('order.')) return readPath(this.facts.order, path.slice('order.'.length))
    return readPath(factsOf(this.facts, scope), path)
  }

  membersOf(scope: CollectionScope): CheckScope[] {
    return membersOf(this.facts, scope)
  }

  dependencyFingerprints(ruleId: RuleId, scope: CheckScope): string[] {
    const target = this.scopeOfRule.get(ruleId)
    if (target === undefined) return []
    const scopes =
      target === 'order' || target === scope.kind ? [scope] : membersOf(this.facts, target)
    return scopes.map((member) => this.resultOf(ruleId, member)?.inputFingerprint ?? 'missing')
  }

  fingerprintOf(rule: RuleDefinition, scope: CheckScope): string {
    return ruleInputFingerprint({
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      scopeKey: scopeKey(scope),
      inputs: Object.fromEntries(rule.inputPaths.map((path) => [path, this.factOf(path, scope)])),
      entityVersions: Object.fromEntries(
        rule.invalidationTriggers.map((trigger) => [trigger, this.facts.entityVersions[trigger]]),
      ),
      upstream: Object.fromEntries(
        rule.dependsOn.map((dependency) => [
          dependency,
          this.dependencyFingerprints(dependency, scope),
        ]),
      ),
    })
  }

  dependencyOutcome(ruleId: RuleId, scope: CheckScope): Outcome {
    const target = this.scopeOfRule.get(ruleId)
    if (target === undefined) return outcome('ERROR')
    if (target === 'order' || target === scope.kind) {
      const status = this.statusOf(ruleId, scope)
      return outcome(status, isPendingCheckStatus(status) ? [ruleId] : [])
    }
    return combineAllOf(
      membersOf(this.facts, target).map((member) => {
        const status = this.statusOf(ruleId, member)
        return outcome(status, isPendingCheckStatus(status) ? [ruleId] : [])
      }),
    )
  }
}

function blockingDependencies(
  rule: RuleDefinition,
  scope: CheckScope,
  state: GraphState,
): RuleId[] {
  const handledByApplicability = new Set(rule.appliesWhen ? referencedRules(rule.appliesWhen) : [])
  return rule.dependsOn.filter((dependency) => {
    if (handledByApplicability.has(dependency)) return false
    const { status } = state.dependencyOutcome(dependency, scope)
    return status !== 'PASS' && status !== 'NOT_APPLICABLE'
  })
}

function evaluateExpressionRule(
  rule: RuleDefinition,
  scope: CheckScope,
  state: GraphState,
  parameters: PolicyParameters,
): LeafEvaluation {
  const expression = rule.expression
  if (!expression) throw new Error(`${rule.ruleId} has no expression`)
  const context = feelContext(state.facts, scope, parameters)
  return {
    status: statusOfPredicate(evaluateFeel(expression.passWhen, context)),
    ...(expression.observe ? { observedValue: evaluateFeel(expression.observe, context) } : {}),
  }
}

function runLeaf(
  rule: RuleDefinition,
  scope: CheckScope,
  state: GraphState,
  environment: EvaluationEnvironment,
): LeafEvaluation | Promise<LeafEvaluation> {
  if (rule.evaluator.kind === 'expression') {
    return evaluateExpressionRule(rule, scope, state, environment.parameters)
  }
  const evaluator = environment.evaluators.get(rule.evaluator.ref)
  if (!evaluator) throw new Error(`no evaluator ${rule.evaluator.ref}`)
  return evaluator({
    rule,
    scope,
    facts: state.facts,
    scopeFacts: factsOf(state.facts, scope),
    parameters: environment.parameters,
    resultOf: (ruleId) => state.resultOf(ruleId, scope),
  })
}

async function evaluateLeaf(
  rule: RuleDefinition,
  scope: CheckScope,
  state: GraphState,
  environment: EvaluationEnvironment,
): Promise<Omit<RuleOutcome, 'inputFingerprint'>> {
  try {
    const evaluation = await runLeaf(rule, scope, state, environment)
    return { ruleId: rule.ruleId, scope, blockedBy: [], ...evaluation }
  } catch (error) {
    return { ruleId: rule.ruleId, scope, status: 'ERROR', blockedBy: [], error: String(error) }
  }
}

async function evaluateRuleInstance(
  rule: RuleDefinition,
  scope: CheckScope,
  state: GraphState,
  environment: EvaluationEnvironment,
): Promise<Omit<RuleOutcome, 'inputFingerprint'>> {
  if (rule.appliesWhen) {
    const applicability = evaluateExpression(rule.appliesWhen, state, scope)
    if (applicability.status === 'FAIL' || applicability.status === 'NOT_APPLICABLE') {
      return { ruleId: rule.ruleId, scope, status: 'NOT_APPLICABLE', blockedBy: [] }
    }
    if (applicability.status !== 'PASS') {
      return {
        ruleId: rule.ruleId,
        scope,
        status: applicability.status === 'ERROR' ? 'ERROR' : 'BLOCKED_DEPENDENCY',
        blockedBy: applicability.blockedBy,
      }
    }
  }
  if (rule.combiner) {
    const combined = evaluateExpression(rule.combiner, state, scope)
    return { ruleId: rule.ruleId, scope, status: combined.status, blockedBy: combined.blockedBy }
  }
  const blockedBy = blockingDependencies(rule, scope, state)
  if (blockedBy.length > 0) {
    return { ruleId: rule.ruleId, scope, status: 'BLOCKED_DEPENDENCY', blockedBy }
  }
  return evaluateLeaf(rule, scope, state, environment)
}

const defaultReusableKinds: readonly RuleEngineKind[] = [
  'expression',
  'code',
  'decisionTable',
  'semantic',
]

function reusableOutcome(
  previous: RuleOutcome | undefined,
  fingerprint: string,
): RuleOutcome | undefined {
  if (!previous || previous.inputFingerprint !== fingerprint) return undefined
  if (previous.status === 'INVALIDATED' || previous.status === 'ERROR') return undefined
  const { invalidatedBy: _invalidatedBy, ...kept } = previous
  return { ...kept, reused: true }
}

export async function evaluateRuleGraph(
  ruleSet: RuleSet,
  facts: CaseFacts,
  environment: EvaluationEnvironment,
  options: EvaluationOptions = {},
): Promise<RuleGraphEvaluation> {
  const state = new GraphState(ruleSet.rules, facts)
  const escalations: RuleGraphEvaluation['escalations'] = []
  const previous = new Map(
    (options.previous ?? []).map((result) => [
      `${result.ruleId}@${scopeKey(result.scope)}`,
      result,
    ]),
  )
  const reusableKinds = new Set(options.reusableKinds ?? defaultReusableKinds)
  for (const rule of topologicalOrder(ruleSet.rules)) {
    const results = await Promise.all(
      membersOf(facts, rule.scope).map(async (scope): Promise<RuleOutcome> => {
        const inputFingerprint = state.fingerprintOf(rule, scope)
        const reused = reusableKinds.has(rule.evaluator.kind)
          ? reusableOutcome(previous.get(`${rule.ruleId}@${scopeKey(scope)}`), inputFingerprint)
          : undefined
        if (reused) return reused
        const result = await evaluateRuleInstance(rule, scope, state, environment)
        return { ...result, inputFingerprint }
      }),
    )
    for (const result of results) {
      state.record(result)
      if (result.status === 'UNKNOWN' && rule.unknownPolicy === 'escalateToHuman') {
        escalations.push({ ruleId: rule.ruleId, scope: result.scope })
      }
    }
  }
  return {
    outcomes: state.all(),
    escalations,
    outcomeOf: (ruleId, scope = { kind: 'order' }) => state.resultOf(ruleId, scope),
  }
}
