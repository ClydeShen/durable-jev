import { describe, expect, it } from 'vitest'
import { formatLocation, parseLocation } from './location-state.js'

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
