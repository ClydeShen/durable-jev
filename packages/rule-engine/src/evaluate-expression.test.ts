import type { CheckScope, CheckStatus, RuleId } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { combineAnd, combineOr, outcome } from './combinators.js'
import { type ExpressionContext, evaluateExpression } from './evaluate-expression.js'
import { allOf, and, anyOf, type Expression, feel, ifThen, not, or, ref } from './expression.js'

function scopeKey(scope: CheckScope): string {
  if (scope.kind === 'cargoItem') return scope.cargoItemId
  if (scope.kind === 'leg') return scope.legId
  return 'order'
}

const feelValues: Record<string, boolean> = { true: true, false: false }

function contextWith(
  statuses: Record<string, CheckStatus>,
  members: Partial<Record<'cargoItem' | 'leg', string[]>> = {},
): ExpressionContext {
  return {
    statusOf: (ruleId: RuleId, scope: CheckScope) =>
      statuses[`${ruleId}@${scopeKey(scope)}`] ?? statuses[ruleId] ?? 'UNKNOWN',
    observedValueOf: () => undefined,
    feel: (expression: string) => feelValues[expression] ?? null,
    membersOf: (scope) =>
      (members[scope] ?? []).map((id) =>
        scope === 'cargoItem' ? { kind: 'cargoItem', cargoItemId: id } : { kind: 'leg', legId: id },
      ),
  }
}

const statusOf = (expression: Expression, context: ExpressionContext) =>
  evaluateExpression(expression, context).status

describe('unknown and waiting never become PASS', () => {
  it.each<CheckStatus>(['UNKNOWN', 'WAITING_HUMAN', 'BLOCKED_DEPENDENCY', 'INVALIDATED'])(
    '%s survives NOT and OR with a failing sibling',
    (pending) => {
      const context = contextWith({ R01: pending, R02: 'FAIL' })
      expect(statusOf(not(ref('R01')), context)).toBe(pending)
      expect(statusOf(or(ref('R02'), ref('R01')), context)).toBe(pending)
      expect(statusOf(not(or(ref('R02'), not(ref('R01')))), context)).toBe(pending)
    },
  )

  it('lets OR pass only on an actual PASS', () => {
    expect(statusOf(or(ref('R01'), ref('R02')), contextWith({ R01: 'UNKNOWN', R02: 'PASS' }))).toBe(
      'PASS',
    )
    expect(statusOf(or(ref('R01'), ref('R02')), contextWith({ R01: 'FAIL', R02: 'FAIL' }))).toBe(
      'FAIL',
    )
  })
})

describe('and', () => {
  it('ranks FAIL over ERROR over pending, and ignores NOT_APPLICABLE', () => {
    expect(combineAnd([outcome('WAITING_HUMAN'), outcome('ERROR'), outcome('FAIL')]).status).toBe(
      'FAIL',
    )
    expect(combineAnd([outcome('WAITING_HUMAN'), outcome('ERROR')]).status).toBe('ERROR')
    expect(combineAnd([outcome('PASS'), outcome('WAITING_HUMAN'), outcome('UNKNOWN')]).status).toBe(
      'WAITING_HUMAN',
    )
    expect(combineAnd([outcome('PASS'), outcome('NOT_APPLICABLE')]).status).toBe('PASS')
    expect(combineAnd([outcome('NOT_APPLICABLE')]).status).toBe('NOT_APPLICABLE')
  })

  it('records which rules block it', () => {
    const context = contextWith({ R10: 'PASS', R11: 'WAITING_HUMAN', R12: 'UNKNOWN' })
    expect(evaluateExpression(and(ref('R10'), ref('R11'), ref('R12')), context)).toEqual({
      status: 'WAITING_HUMAN',
      blockedBy: ['R11', 'R12'],
    })
  })
})

describe('or', () => {
  it('reports the first unresolved child when nothing passes', () => {
    expect(combineOr([outcome('FAIL'), outcome('ERROR'), outcome('UNKNOWN')]).status).toBe('ERROR')
  })
})

describe('ifThen', () => {
  const guarded = ifThen(ref('R19'), ref('R20'))

  it('is not applicable when the condition does not hold', () => {
    expect(statusOf(guarded, contextWith({ R19: 'FAIL', R20: 'UNKNOWN' }))).toBe('NOT_APPLICABLE')
    expect(statusOf(guarded, contextWith({ R19: 'NOT_APPLICABLE' }))).toBe('NOT_APPLICABLE')
  })

  it('evaluates the consequence when the condition holds', () => {
    expect(statusOf(guarded, contextWith({ R19: 'PASS', R20: 'WAITING_HUMAN' }))).toBe(
      'WAITING_HUMAN',
    )
  })

  it('blocks while the condition is pending', () => {
    expect(evaluateExpression(guarded, contextWith({ R19: 'UNKNOWN', R20: 'PASS' }))).toEqual({
      status: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R19'],
    })
  })
})

describe('feel conditions', () => {
  it('maps FEEL true, false and missing values to PASS, FAIL and UNKNOWN', () => {
    expect(statusOf(feel('true'), contextWith({}))).toBe('PASS')
    expect(statusOf(feel('false'), contextWith({}))).toBe('FAIL')
    expect(statusOf(feel('missing'), contextWith({}))).toBe('UNKNOWN')
  })
})

describe('collections', () => {
  it('treats an empty collection as UNKNOWN, not as all passing', () => {
    expect(statusOf(allOf('cargoItem', ref('R02')), contextWith({ R02: 'PASS' }))).toBe('UNKNOWN')
    expect(statusOf(anyOf('leg', ref('R24')), contextWith({ R24: 'PASS' }))).toBe('UNKNOWN')
  })

  it('fails the whole order when one cargo item fails', () => {
    const context = contextWith(
      { 'R02@ITEM-1': 'PASS', 'R02@ITEM-2': 'FAIL', 'R02@ITEM-3': 'PASS' },
      { cargoItem: ['ITEM-1', 'ITEM-2', 'ITEM-3'] },
    )
    expect(statusOf(allOf('cargoItem', ref('R02')), context)).toBe('FAIL')
    expect(statusOf(anyOf('cargoItem', ref('R02')), context)).toBe('PASS')
  })
})

describe('commercial readiness from the PRD example', () => {
  const commercialReady = and(
    ref('R31'),
    or(ref('R32'), and(ref('R33'), ref('R34'))),
    or(not(ref('R35')), ref('R34')),
  )

  it('passes within credit without an extra cost approval', () => {
    const context = contextWith({ R31: 'PASS', R32: 'PASS', R33: 'NOT_APPLICABLE', R35: 'FAIL' })
    expect(statusOf(commercialReady, context)).toBe('PASS')
  })

  it('waits for the credit exception approval when over credit', () => {
    const context = contextWith({
      R31: 'PASS',
      R32: 'FAIL',
      R33: 'PASS',
      R34: 'WAITING_HUMAN',
      R35: 'FAIL',
    })
    expect(evaluateExpression(commercialReady, context)).toEqual({
      status: 'WAITING_HUMAN',
      blockedBy: ['R34'],
    })
  })
})
