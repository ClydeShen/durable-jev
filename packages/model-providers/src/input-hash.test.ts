import { describe, expect, it } from 'vitest'
import { documentMatchQuestion } from './fixtures.js'
import { semanticInputHash } from './input-hash.js'

describe('semanticInputHash', () => {
  it('ignores key order and changes with the state', () => {
    const hash = semanticInputHash(documentMatchQuestion, { a: 1, b: { c: 2, d: 3 } })
    expect(semanticInputHash(documentMatchQuestion, { b: { d: 3, c: 2 }, a: 1 })).toBe(hash)
    expect(semanticInputHash(documentMatchQuestion, { a: 1, b: { c: 2, d: 4 } })).not.toBe(hash)
  })
})
