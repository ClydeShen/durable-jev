import type { EvaluationInputs } from './evaluation-inputs.types.js'
import {
  conditionHolds,
  type LeafRule,
  notApplicable,
  numericParameter,
  outcome,
  passOrFail,
} from './leaf.helpers.js'

const creditPosition = (inputs: EvaluationInputs) => {
  const customer = inputs.referenceData.customers.find(
    (known) => known.customerId === inputs.shipment.customerId,
  )
  const { quote } = inputs.shipment
  if (!customer || customer.currency !== quote.currency) return undefined
  const remainingCreditCents = customer.creditLimitCents - customer.creditUsedCents
  return {
    quoteCents: quote.amountCents,
    remainingCreditCents,
    excessCents: quote.amountCents - remainingCreditCents,
  }
}

const customerAccountActive: LeafRule = (_subject, inputs) => {
  const customer = inputs.referenceData.customers.find(
    (known) => known.customerId === inputs.shipment.customerId,
  )
  if (!customer) return outcome('UNKNOWN')
  return passOrFail(customer.status === 'ACTIVE', { status: customer.status })
}

const quoteWithinCredit: LeafRule = (_subject, inputs) => {
  const position = creditPosition(inputs)
  if (!position) return outcome('UNKNOWN')
  return passOrFail(position.excessCents <= 0, position)
}

const creditExceptionWithinLimit: LeafRule = (_subject, inputs) => {
  const position = creditPosition(inputs)
  if (!position) return outcome('UNKNOWN')
  const limitCents = numericParameter(inputs.policy, 'creditExceptionLimitCents')
  return passOrFail(position.excessCents <= limitCents, {
    ...position,
    approvableLimitCents: limitCents,
  })
}

const extraCostApprovalRequired: LeafRule = (_subject, inputs) => {
  const { amountCents, baselineAmountCents } = inputs.shipment.quote
  if (baselineAmountCents === undefined) return notApplicable({ baselineAmountCents: null })
  const thresholdCents = numericParameter(inputs.policy, 'extraCostApprovalThresholdCents')
  const extraCents = amountCents - baselineAmountCents
  return conditionHolds(extraCents > thresholdCents, { extraCents, thresholdCents })
}

export const commercialLeafRules: Readonly<Record<string, LeafRule>> = {
  customerAccountActive,
  quoteWithinCredit,
  creditExceptionWithinLimit,
  extraCostApprovalRequired,
}
