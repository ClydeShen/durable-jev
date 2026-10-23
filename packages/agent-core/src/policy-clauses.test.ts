import { describe, expect, it } from 'vitest'
import { policyClauses, policyDocument } from './policy-clauses.js'

const markdown = `# Shipment Release Policy

Controlled document.

## 3. Definitions

| Term | Meaning |
|---|---|
| Release | The dispatcher's confirmation |

## Part A. Order and cargo basics

**R01 Order complete.** The order must name a customer
and a delivery window.

- one cargo item
- one leg
`

describe('policyDocument', () => {
  it('keeps table rows and list items on their own lines and joins paragraphs', () => {
    const policy = policyDocument(markdown)
    expect(policy.title).toBe('Shipment Release Policy')
    expect(policy.preamble).toEqual(['Controlled document.'])
    expect(policy.sections.map((section) => section.paragraphs)).toEqual([
      ["| Term | Meaning |\n|---|---|\n| Release | The dispatcher's confirmation |"],
      [
        '**R01 Order complete.** The order must name a customer and a delivery window.',
        '- one cargo item\n- one leg',
      ],
    ])
  })

  it('finds a rule clause under its section', () => {
    expect(policyClauses(policyDocument(markdown)).get('R01')).toEqual({
      section: 'Part A. Order and cargo basics',
      paragraphs: ['R01 Order complete. The order must name a customer and a delivery window.'],
    })
  })
})
