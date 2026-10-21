import { describe, expect, it } from 'vitest'
import { feelInputs } from './feel.js'

describe('feelInputs', () => {
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
