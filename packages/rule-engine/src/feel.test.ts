import { describe, expect, it } from 'vitest'
import type { CaseFacts } from './facts.js'
import { feelContext, feelInputs } from './feel.js'

describe('feelInputs', () => {
  it('reads domain-provided roots and does not confuse name prefixes', () => {
    const context = { record: { amount: 600 }, records: [{ amount: 100 }], params: { cap: 750 } }
    expect(
      feelInputs(['record.amount <= params.cap and sum(records.amount) > 0'], context),
    ).toEqual({
      'record.amount': 600,
      'records.amount': [100],
      'params.cap': 750,
    })
    expect(feelInputs(['recording.amount > 0'], context)).toEqual({})
    expect(feelInputs(['record.amount > 0'], {})).toEqual({})
  })

  it('fingerprints only the context paths an expression reads', () => {
    const context = {
      order: { customer: { active: true, name: 'Acme' }, quote: { amountCents: 100 } },
      cargoItems: [{ weightGrams: 5 }, { weightGrams: 7 }],
      params: { limit: 10 },
    }
    expect(feelInputs(['order.customer.active = true'], context)).toEqual({
      'order.customer.active': true,
    })
    expect(feelInputs(['sum(cargoItems.weightGrams) <= params.limit'], context)).toEqual({
      'cargoItems.weightGrams': [5, 7],
      'params.limit': 10,
    })
  })
})

describe('feelContext', () => {
  it('uses domain aliases and keeps policy parameters outside business data', () => {
    const facts: CaseFacts = {
      entityVersions: {},
      root: { scope: { kind: 'order' }, facts: { amount: 600 } },
      context: { record: { amount: 600 }, params: { cap: 999 } },
      collections: {
        leg: [
          {
            scope: { kind: 'leg', legId: 'LEG-1' },
            facts: { cost: 120 },
            context: { candidate: { cost: 120 }, params: { cap: 999 } },
          },
        ],
      },
    }
    expect(feelContext(facts, { kind: 'leg', legId: 'LEG-1' }, { cap: 750 })).toEqual({
      record: { amount: 600 },
      candidate: { cost: 120 },
      params: { cap: 750 },
    })
    expect(feelContext(facts, { kind: 'leg', legId: 'LEG-MISSING' }, {})).toEqual({
      record: { amount: 600 },
      params: {},
    })
  })
})
