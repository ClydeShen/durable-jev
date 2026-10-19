import { type LeafRule, outcome, passOrFail } from './leaf-helpers.js'

const customerAccountActive: LeafRule = (_subject, inputs) => {
  const customer = inputs.referenceData.customers.find(
    (known) => known.customerId === inputs.shipment.customerId,
  )
  if (!customer) return outcome('UNKNOWN')
  return passOrFail(customer.status === 'ACTIVE', { status: customer.status })
}

const quoteWithinCredit: LeafRule = (_subject, inputs) => {
  const customer = inputs.referenceData.customers.find(
    (known) => known.customerId === inputs.shipment.customerId,
  )
  const { quote } = inputs.shipment
  if (!customer || customer.currency !== quote.currency) return outcome('UNKNOWN')
  const remainingCreditCents = customer.creditLimitCents - customer.creditUsedCents
  return passOrFail(quote.amountCents <= remainingCreditCents, {
    quoteCents: quote.amountCents,
    remainingCreditCents,
  })
}

const preloadHumanTasksValid: LeafRule = (_subject, inputs) =>
  outcome(inputs.preloadHumanTasksStatus())

export const commercialLeafRules: Readonly<Record<string, LeafRule>> = {
  customerAccountActive,
  quoteWithinCredit,
  preloadHumanTasksValid,
}
