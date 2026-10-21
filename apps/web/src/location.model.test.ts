import { describe, expect, it } from 'vitest'
import {
  formatConsoleLocation,
  formatLocation,
  isConsoleHash,
  parseConsoleLocation,
  parseLocation,
} from './location.model.js'

describe('location state', () => {
  it('round-trips a case and a view through the hash', () => {
    const hash = formatLocation({ caseId: 'CASE-LOG-003', view: 'tree' })
    expect(hash).toBe('#/cases/CASE-LOG-003?view=tree')
    expect(parseLocation(hash)).toEqual({ caseId: 'CASE-LOG-003', view: 'tree' })
  })

  it('falls back to the flow view and no case for anything else', () => {
    expect(parseLocation('')).toEqual({ caseId: undefined, view: 'flow' })
    expect(parseLocation('#/nonsense?view=bogus')).toEqual({ caseId: undefined, view: 'flow' })
    expect(formatLocation({ caseId: undefined, view: 'flow' })).toBe('')
  })
})

describe('console location', () => {
  it('round-trips a case, a tab and a highlighted rule', () => {
    const hash = formatConsoleLocation({
      correlationId: 'corr-CASE-1',
      tab: 'judgements',
      rule: 'R10',
    })
    expect(hash).toBe('#/console/corr-CASE-1?tab=judgements&rule=R10')
    expect(parseConsoleLocation(hash)).toEqual({
      correlationId: 'corr-CASE-1',
      tab: 'judgements',
      rule: 'R10',
      trace: undefined,
    })
    expect(isConsoleHash(hash)).toBe(true)
    expect(isConsoleHash('#/cases/CASE-1')).toBe(false)
  })

  it('opens the case list on the timeline tab by default', () => {
    expect(formatConsoleLocation({})).toBe('#/console')
    expect(parseConsoleLocation('#/console?tab=nonsense')).toMatchObject({
      correlationId: undefined,
      tab: 'timeline',
    })
  })
})
