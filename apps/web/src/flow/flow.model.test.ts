import type { CheckResult, GateStatus } from '@durable-jev/contracts'
import type { RuleBranch, RuleDefinition } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import {
  aggregateStatus,
  buildFlowModel,
  edgeStateFor,
  withoutRedundantEdges,
} from './flow.model.js'

const rule = (ruleId: string, branch: RuleBranch, dependsOn: string[] = []) =>
  ({
    ruleId,
    branch,
    dependsOn,
    evaluator: { kind: 'code', ref: ruleId },
  }) as unknown as RuleDefinition

const check = (ruleId: string, gateStatus: GateStatus, blockedBy: string[] = []) =>
  ({
    checkResultId: ruleId,
    ruleId,
    subject: { scope: 'order', entityId: 'order' },
    gateStatus,
    blockedBy,
  }) as unknown as CheckResult

const rules = [
  rule('R01', 'base'),
  rule('R02', 'base', ['R01']),
  rule('R09', 'controlled', ['R02']),
  rule('R31', 'commercial', ['R01']),
  rule('R32', 'commercial', ['R01']),
  rule('R34', 'commercial', ['R31']),
  rule('R36', 'commercial', ['R31', 'R32', 'R34']),
  rule('R39-LOAD', 'release', ['R02', 'R09', 'R36']),
  rule('R40', 'release', ['R39-LOAD']),
]
const checks = [
  check('R01', 'PASS'),
  check('R02', 'PASS'),
  check('R09', 'NOT_APPLICABLE'),
  check('R31', 'PASS'),
  check('R32', 'FAIL'),
  check('R34', 'WAITING_HUMAN'),
  check('R36', 'BLOCKED_DEPENDENCY', ['R34']),
  check('R39-LOAD', 'BLOCKED_DEPENDENCY', ['R34']),
  check('R40', 'BLOCKED_DEPENDENCY', ['R39-LOAD']),
]
const build = (view: Parameters<typeof buildFlowModel>[0]['view'], showNotApplicable = false) =>
  buildFlowModel({ rootRuleId: 'R40', view, rules, checks, humanTasks: [], showNotApplicable })

describe('aggregateStatus', () => {
  it('reports the most severe status', () => {
    expect(aggregateStatus(['PASS', 'FAIL', 'WAITING_HUMAN'])).toBe('FAIL')
    expect(aggregateStatus(['PASS', 'NOT_APPLICABLE'])).toBe('PASS')
    expect(aggregateStatus(['NOT_APPLICABLE', 'NOT_APPLICABLE'])).toBe('NOT_APPLICABLE')
  })
})

describe('edgeStateFor', () => {
  it('flows only from a passed step and stops everywhere else', () => {
    expect(edgeStateFor('PASS')).toBe('flowing')
    expect(edgeStateFor('WAITING_HUMAN')).toBe('waiting')
    expect(edgeStateFor('BLOCKED_DEPENDENCY')).toBe('blocked')
    expect(edgeStateFor('FAIL')).toBe('failed')
    expect(edgeStateFor('NOT_APPLICABLE')).toBe('inactive')
  })
})

describe('withoutRedundantEdges', () => {
  it('drops a shortcut that a longer path already covers', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'A', to: 'C' },
    ]
    expect(withoutRedundantEdges(edges)).toEqual(edges.slice(0, 2))
  })
})

describe('overview', () => {
  it('takes a branch status from its outlet, so a recovered failure inside does not show as failed', () => {
    const commercial = build({ kind: 'overview' }).nodes.find(
      (node) => node.id === 'branch:commercial',
    )
    expect(commercial).toMatchObject({
      status: 'WAITING_HUMAN',
      statusCounts: { FAIL: 1, WAITING_HUMAN: 1 },
    })
  })

  it('groups rules by branch, hides branches that do not apply, and says who it waits on', () => {
    const model = build({ kind: 'overview' })
    expect(model.nodes.map((node) => node.id).sort()).toEqual([
      'R39-LOAD',
      'R40',
      'branch:base',
      'branch:commercial',
    ])
    const commercial = model.nodes.find((node) => node.id === 'branch:commercial')
    expect(commercial).toMatchObject({ status: 'WAITING_HUMAN', waitingOn: [{ ruleId: 'R34' }] })
    expect(model.edges).toEqual(
      expect.arrayContaining([
        { from: 'branch:base', to: 'branch:commercial', state: 'flowing' },
        { from: 'branch:commercial', to: 'R39-LOAD', state: 'waiting' },
        { from: 'R39-LOAD', to: 'R40', state: 'blocked' },
      ]),
    )
    expect(model.edges).not.toContainEqual(
      expect.objectContaining({ from: 'branch:base', to: 'R39-LOAD' }),
    )
  })
})

describe('branch view', () => {
  it('shows only the rules of one branch', () => {
    const model = build({ kind: 'branch', branch: 'commercial' })
    expect(model.nodes.map((node) => node.id).sort()).toEqual(['R31', 'R32', 'R34', 'R36'])
    expect(model.edges).toEqual(
      expect.arrayContaining([
        { from: 'R31', to: 'R34', state: 'flowing' },
        { from: 'R32', to: 'R36', state: 'failed' },
        { from: 'R34', to: 'R36', state: 'waiting' },
      ]),
    )
  })
})

describe('all rules view', () => {
  it('can include not applicable rules as inactive', () => {
    const model = build({ kind: 'all' }, true)
    expect(model.edges).toContainEqual({ from: 'R09', to: 'R39-LOAD', state: 'inactive' })
  })
})

describe('change markers', () => {
  it('marks a rule and its branch as re-checked after the latest change', () => {
    const changed = checks.map((result) =>
      result.ruleId === 'R31' ? { ...result, affectedByChange: 'CHG-CASE-r2' } : result,
    )
    const overview = buildFlowModel({
      rootRuleId: 'R40',
      view: { kind: 'overview' },
      rules,
      checks: changed,
      humanTasks: [],
      showNotApplicable: false,
    })
    expect(
      overview.nodes.find((node) => node.id === 'branch:commercial')?.recheckedAfterChange,
    ).toBe('CHG-CASE-r2')
    expect(
      overview.nodes.find((node) => node.id === 'branch:base')?.recheckedAfterChange,
    ).toBeUndefined()
  })
})
