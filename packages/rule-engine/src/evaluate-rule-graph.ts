import {
  type CheckScope,
  type CheckStatus,
  isPendingCheckStatus,
  type RuleEngineKind,
  type RuleId,
} from '@durable-jev/contracts'
import { combineAllOf, type Outcome, outcome } from './combinators.js'
import { type ExpressionContext, evaluateExpression } from './evaluate-expression.js'
import { type CollectionScope, type Expression, referencedRules } from './expression.js'
import type { CaseFacts, Facts } from './facts.js'
import {
  evaluateFeel,
  feelContext,
  feelInputs,
  type PolicyParameters,
  semanticState,
  statusOfPredicate,
} from './feel.js'
import { ruleInputFingerprint } from './fingerprint.js'
import { evaluateMixing } from './mixing.js'
import type { MixingRule, RuleDefinition, RuleScope, RuleSet } from './rule-definition.js'
import { RuleIndex, type SelectionDecision, type SelectionProfile } from './rule-selection.js'

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
  inputFingerprint: string
  resultOf(ruleId: RuleId): RuleOutcome | undefined
  holds(expression: Expression): Outcome
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
  /** Set when rule selection filtered this extension rule out without evaluating it. */
  filtered?: true
}

export interface EvaluationEnvironment {
  evaluators: ReadonlyMap<string, LeafEvaluator>
  parameters: PolicyParameters
}

export interface EvaluationOptions {
  previous?: readonly RuleOutcome[]
  reusableKinds?: readonly RuleEngineKind[]
  executes?(rule: RuleDefinition): boolean
  provided?: readonly RuleOutcome[]
}

const outcomeKey = (outcome: { ruleId: RuleId; scope: CheckScope }) =>
  `${outcome.ruleId}@${scopeKey(outcome.scope)}`

function providedOutcome(
  provided: ReadonlyMap<string, RuleOutcome>,
  ruleId: RuleId,
  scope: CheckScope,
): RuleOutcome {
  return (
    provided.get(outcomeKey({ ruleId, scope })) ?? {
      ruleId,
      scope,
      status: 'UNKNOWN',
      blockedBy: [],
      inputFingerprint: 'unreported',
    }
  )
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

function topologicalOrder(rules: readonly RuleDefinition[]): RuleDefinition[] {
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
    private readonly parameters: PolicyParameters,
    readonly mixingMatrix: readonly MixingRule[],
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

  feel(expression: string, scope: CheckScope): unknown {
    return evaluateFeel(expression, feelContext(this.facts, scope, this.parameters))
  }

  private factOf(path: string, scope: CheckScope): unknown {
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

  private inputsOf(rule: RuleDefinition, scope: CheckScope): Record<string, unknown> {
    const feelSources = [
      rule.expression?.passWhen,
      rule.expression?.observe,
      rule.mixing?.categories,
      rule.mixing?.qualifications,
    ].filter((source): source is string => source !== undefined)
    if (feelSources.length > 0) {
      return feelInputs(feelSources, feelContext(this.facts, scope, this.parameters))
    }
    if (rule.semantic) {
      return semanticState(rule.semantic.state, feelContext(this.facts, scope, this.parameters))
    }
    return Object.fromEntries(rule.inputPaths.map((path) => [path, this.factOf(path, scope)]))
  }

  fingerprintOf(rule: RuleDefinition, scope: CheckScope): string {
    return ruleInputFingerprint({
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      scopeKey: scopeKey(scope),
      inputs: this.inputsOf(rule, scope),
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
  inputFingerprint: string,
): LeafEvaluation | Promise<LeafEvaluation> {
  if (rule.evaluator.kind === 'expression') {
    return evaluateExpressionRule(rule, scope, state, environment.parameters)
  }
  if (rule.evaluator.kind === 'decisionTable') {
    if (!rule.mixing) throw new Error(`${rule.ruleId} has no mixing table`)
    return evaluateMixing(
      state.mixingMatrix,
      state.feel(rule.mixing.categories, scope),
      state.feel(rule.mixing.qualifications, scope),
    )
  }
  const evaluator = environment.evaluators.get(rule.evaluator.ref)
  if (!evaluator) throw new Error(`no evaluator ${rule.evaluator.ref}`)
  return evaluator({
    rule,
    scope,
    facts: state.facts,
    scopeFacts: factsOf(state.facts, scope),
    parameters: environment.parameters,
    inputFingerprint,
    resultOf: (ruleId) => state.resultOf(ruleId, scope),
    holds: (expression) => evaluateExpression(expression, state, scope),
  })
}

async function evaluateLeaf(
  rule: RuleDefinition,
  scope: CheckScope,
  state: GraphState,
  environment: EvaluationEnvironment,
  inputFingerprint: string,
): Promise<Omit<RuleOutcome, 'inputFingerprint'>> {
  try {
    const evaluation = await runLeaf(rule, scope, state, environment, inputFingerprint)
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
  inputFingerprint: string,
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
  return evaluateLeaf(rule, scope, state, environment, inputFingerprint)
}

const indexes = new WeakMap<RuleSet, RuleIndex>()

function indexOf(ruleSet: RuleSet): RuleIndex {
  const existing = indexes.get(ruleSet)
  if (existing) return existing
  const index = new RuleIndex(ruleSet.rules)
  indexes.set(ruleSet, index)
  return index
}

function selectionProfile(ruleSet: RuleSet, state: GraphState): SelectionProfile {
  const classifier = ruleSet.selection?.classifierRuleId
  const classifications = classifier
    ? membersOf(state.facts, 'cargoItem').map((scope) => state.resultOf(classifier, scope))
    : []
  const decided = classifications.every((result) => result?.status === 'PASS')
  return {
    destination: state.facts.order.destinationCountry,
    customer: state.facts.order.customerId,
    commodityGroups: decided
      ? new Set(classifications.flatMap((result) => result?.observedValue as string[]))
      : undefined,
  }
}

function selectionOutcome(
  rule: RuleDefinition,
  scope: CheckScope,
  decision: Exclude<SelectionDecision, 'selected'>,
  classifier: RuleId | undefined,
): RuleOutcome {
  return decision === 'filtered'
    ? {
        ruleId: rule.ruleId,
        scope,
        status: 'NOT_APPLICABLE',
        blockedBy: [],
        inputFingerprint: 'filtered',
        filtered: true,
      }
    : {
        ruleId: rule.ruleId,
        scope,
        status: 'BLOCKED_DEPENDENCY',
        blockedBy: classifier ? [classifier] : [],
        inputFingerprint: 'awaiting-classification',
      }
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
  const state = new GraphState(ruleSet.rules, facts, environment.parameters, ruleSet.mixingMatrix)
  const escalations: RuleGraphEvaluation['escalations'] = []
  const previous = new Map((options.previous ?? []).map((result) => [outcomeKey(result), result]))
  const provided = new Map((options.provided ?? []).map((result) => [outcomeKey(result), result]))
  const executes = options.executes ?? (() => true)
  const reusableKinds = new Set(options.reusableKinds ?? defaultReusableKinds)
  const index = indexOf(ruleSet)
  for (const rule of topologicalOrder(ruleSet.rules)) {
    const selection =
      rule.applicability && executes(rule)
        ? index.decide(rule.ruleId, selectionProfile(ruleSet, state))
        : 'selected'
    const results = await Promise.all(
      membersOf(facts, rule.scope).map(async (scope): Promise<RuleOutcome> => {
        if (!executes(rule)) return providedOutcome(provided, rule.ruleId, scope)
        if (selection !== 'selected') {
          return selectionOutcome(rule, scope, selection, ruleSet.selection?.classifierRuleId)
        }
        const inputFingerprint = state.fingerprintOf(rule, scope)
        const reused = reusableKinds.has(rule.evaluator.kind)
          ? reusableOutcome(
              previous.get(outcomeKey({ ruleId: rule.ruleId, scope })),
              inputFingerprint,
            )
          : undefined
        if (reused) return reused
        const result = await evaluateRuleInstance(rule, scope, state, environment, inputFingerprint)
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
  const executed = new Set(ruleSet.rules.filter(executes).map((rule) => rule.ruleId))
  return {
    outcomes: state.all().filter((outcome) => executed.has(outcome.ruleId)),
    escalations,
    outcomeOf: (ruleId, scope = { kind: 'order' }) => state.resultOf(ruleId, scope),
  }
}
