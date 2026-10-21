import type { CheckSubject, GateStatus, RuleId } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { combineAnd, combineIfThen, combineNot, combineOr } from './combinators.js'
import { evaluateExpression } from './evaluate-expression.js'
import type { Expression } from './expression.js'

const ref = (ruleId: string): Expression => ({ kind: 'ref', ruleId: ruleId as RuleId })

function contextWith(
  statuses: Record<string, GateStatus>,
  members: { cargoItem?: string[]; leg?: string[] } = {},
) {
  return {
    subject: { scope: 'order', entityId: 'order' } as CheckSubject,
    statusOf: (ruleId: RuleId, subject: CheckSubject) =>
      statuses[`${ruleId}@${subject.entityId}`] ?? statuses[ruleId] ?? 'UNKNOWN',
    membersOf: (scope: 'cargoItem' | 'leg') => members[scope] ?? [],
  }
}

describe('unknown never becomes PASS', () => {
  it('NOT keeps UNKNOWN', () => {
    expect(combineNot('UNKNOWN')).toBe('UNKNOWN')
    expect(combineNot('WAITING_HUMAN')).toBe('WAITING_HUMAN')
  })

  it('OR with UNKNOWN and FAIL stays UNKNOWN', () => {
    expect(combineOr(['FAIL', 'UNKNOWN'])).toBe('UNKNOWN')
  })

  it('OR passes as soon as one operand passes', () => {
    expect(combineOr(['UNKNOWN', 'PASS'])).toBe('PASS')
  })

  it('NOT required OR approved stays pending while approval is unknown', () => {
    const extraCostRule: Expression = {
      kind: 'or',
      operands: [{ kind: 'not', operand: ref('R35_required') }, ref('R35_approved')],
    }
    const context = contextWith({ R35_required: 'PASS', R35_approved: 'WAITING_HUMAN' })
    expect(evaluateExpression(extraCostRule, context)).toBe('WAITING_HUMAN')
  })
})

describe('AND', () => {
  it('FAIL dominates pending', () => {
    expect(combineAnd(['UNKNOWN', 'FAIL', 'PASS'])).toBe('FAIL')
  })

  it('ERROR dominates pending', () => {
    expect(combineAnd(['WAITING_HUMAN', 'ERROR'])).toBe('ERROR')
  })

  it('returns the first pending status', () => {
    expect(combineAnd(['PASS', 'BLOCKED_DEPENDENCY', 'UNKNOWN'])).toBe('BLOCKED_DEPENDENCY')
  })

  it('ignores NOT_APPLICABLE operands', () => {
    expect(combineAnd(['PASS', 'NOT_APPLICABLE'])).toBe('PASS')
    expect(combineAnd(['NOT_APPLICABLE'])).toBe('NOT_APPLICABLE')
  })
})

describe('ifThen', () => {
  it('is not applicable when the condition fails', () => {
    expect(combineIfThen('FAIL', () => 'FAIL')).toBe('NOT_APPLICABLE')
  })

  it('is blocked while the condition is pending', () => {
    expect(combineIfThen('UNKNOWN', () => 'PASS')).toBe('BLOCKED_DEPENDENCY')
  })
})

describe('collections', () => {
  const eachItemPasses: Expression = { kind: 'allOf', scope: 'cargoItem', expression: ref('R02') }

  it('empty collection is UNKNOWN, not PASS', () => {
    expect(evaluateExpression(eachItemPasses, contextWith({}))).toBe('UNKNOWN')
    const anyLeg: Expression = { kind: 'anyOf', scope: 'leg', expression: ref('R24') }
    expect(evaluateExpression(anyLeg, contextWith({}))).toBe('UNKNOWN')
  })

  it('one failing member fails the whole collection', () => {
    const context = contextWith(
      { 'R02@item-1': 'PASS', 'R02@item-2': 'FAIL' },
      { cargoItem: ['item-1', 'item-2'] },
    )
    expect(evaluateExpression(eachItemPasses, context)).toBe('FAIL')
  })
})
