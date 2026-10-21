import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { policyDocumentPath, renderCurrentPolicyDocument } from './policy-document.js'

describe('policy-v1.md', () => {
  it('is up to date with rules.json, descriptions and parameters', () => {
    expect(readFileSync(policyDocumentPath, 'utf8')).toBe(renderCurrentPolicyDocument())
  })
})
