import type { CheckSubject, TemperatureLog, TemperatureRange } from '@durable-jev/contracts'
import type { EvaluationInputs } from './evaluation-inputs.types.js'
import {
  cargoItemOf,
  conditionHolds,
  confidentChoice,
  type LeafRule,
  legsInSequence,
  minutesBetween,
  notApplicable,
  numericParameter,
  outcome,
  passOrFail,
  temperatureLogFor,
} from './leaf.helpers.js'

const noRiskChoice = 'no_risk'
const reworkRequired = 'REWORK_REQUIRED'

const isWithin = (deciCelsius: number, range: TemperatureRange) =>
  deciCelsius >= range.minDeciCelsius && deciCelsius <= range.maxDeciCelsius

export const longestExcursionMinutes = (log: TemperatureLog, range: TemperatureRange): number => {
  const readings = [...log.readings].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  )
  let longest = 0
  let excursionStartedAt: string | undefined
  for (const reading of readings) {
    if (!isWithin(reading.deciCelsius, range)) {
      excursionStartedAt ??= reading.at
      longest = Math.max(longest, Math.round(minutesBetween(excursionStartedAt, reading.at)))
      continue
    }
    if (excursionStartedAt) {
      longest = Math.max(longest, Math.round(minutesBetween(excursionStartedAt, reading.at)))
    }
    excursionStartedAt = undefined
  }
  return longest
}

const excursionFacts = (subject: CheckSubject, inputs: EvaluationInputs) => {
  const range = cargoItemOf(subject, inputs)?.temperatureRange
  const log = temperatureLogFor(subject, inputs)
  if (!range || !log || log.readings.length === 0) return undefined
  const longest = longestExcursionMinutes(log, range)
  const tolerance = numericParameter(inputs.policy, 'temperatureExcursionToleranceMinutes')
  return {
    longestExcursionMinutes: longest,
    toleranceMinutes: tolerance,
    exceedsTolerance: longest > tolerance,
  }
}

const riskSignal = (subject: CheckSubject, inputs: EvaluationInputs) => {
  const automated = confidentChoice('R18', subject.entityId, inputs)
  if (automated)
    return { source: 'jev', risk: automated.choice !== noRiskChoice, signal: automated.choice }
  const review = inputs.humanDecisionFor('R18', subject.entityId)
  if (review?.outcome === 'APPROVED') {
    return {
      source: 'review',
      risk: Boolean(review.conditions?.includes(reworkRequired)),
      signal: 'reviewed',
    }
  }
  return undefined
}

const temperatureRangeDefined: LeafRule = (subject, inputs) => {
  const range = cargoItemOf(subject, inputs)?.temperatureRange
  return passOrFail(range !== undefined, { range: range ?? null })
}

const vehicleCoversTemperatureRange: LeafRule = (subject, inputs) => {
  const range = cargoItemOf(subject, inputs)?.temperatureRange
  if (!range || inputs.shipment.legs.length === 0) return outcome('UNKNOWN')
  const perVehicle = inputs.shipment.legs.map((leg) => {
    const control = inputs.referenceData.vehicles.find(
      (vehicle) => vehicle.vehicleId === leg.vehicleId,
    )?.temperatureControl
    const covers =
      control !== undefined &&
      control.minDeciCelsius <= range.minDeciCelsius &&
      control.maxDeciCelsius >= range.maxDeciCelsius
    return { vehicleId: leg.vehicleId, temperatureControl: control ?? null, covers }
  })
  return passOrFail(
    perVehicle.every((vehicle) => vehicle.covers),
    { perVehicle },
  )
}

const sensorRecordValid: LeafRule = (subject, inputs) => {
  const log = temperatureLogFor(subject, inputs)
  const departureAt = legsInSequence(inputs)[0]?.plannedDepartureAt
  if (!log || log.readings.length === 0 || !departureAt)
    return outcome('UNKNOWN', { log: log ? 'empty' : 'missing' })
  const latestReadingAt = log.readings
    .map((reading) => reading.at)
    .reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest))
  const ageMinutes = Math.round(minutesBetween(latestReadingAt, departureAt))
  const maxAge = numericParameter(inputs.policy, 'maxSensorRecordAgeMinutes')
  const calibrated = Date.parse(log.calibrationValidUntil) >= Date.parse(departureAt)
  return passOrFail(calibrated && ageMinutes >= 0 && ageMinutes <= maxAge, {
    sensorId: log.sensorId,
    calibrated,
    recordAgeMinutesAtDeparture: ageMinutes,
    maxAgeMinutes: maxAge,
  })
}

const inspectionRiskAssessed: LeafRule = (subject, inputs) => {
  const hasNote = inputs.evidence.inspectionNotes.some(
    (note) => note.cargoItemId === subject.entityId,
  )
  if (!hasNote) return outcome('UNKNOWN', { inspectionNote: 'missing' })
  const automated = confidentChoice('R18', subject.entityId, inputs)
  if (!automated) return outcome('UNKNOWN', { riskSignal: 'uncertain' })
  return outcome('PASS', { riskSignal: automated.choice, probability: automated.probability })
}

const riskSignalPresent: LeafRule = (subject, inputs) => {
  const signal = riskSignal(subject, inputs)
  return signal ? conditionHolds(signal.risk, signal) : outcome('UNKNOWN')
}

const temperatureExcursionChecked: LeafRule = (subject, inputs) => {
  const facts = excursionFacts(subject, inputs)
  return facts ? outcome('PASS', facts) : outcome('UNKNOWN', { temperatureLog: 'missing' })
}

const excursionBeyondTolerance: LeafRule = (subject, inputs) => {
  const facts = excursionFacts(subject, inputs)
  return facts ? conditionHolds(facts.exceedsTolerance, facts) : outcome('UNKNOWN')
}

const reworkRequestedByQuality: LeafRule = (subject, inputs) => {
  const decision = inputs.humanDecisionFor('R20', subject.entityId)
  if (!decision) return notApplicable({ qualityDecision: null })
  return conditionHolds(Boolean(decision.conditions?.includes(reworkRequired)), {
    conditions: decision.conditions ?? [],
  })
}

const retestWithinRange: LeafRule = (subject, inputs) => {
  const range = cargoItemOf(subject, inputs)?.temperatureRange
  const fields = inputs.completedOperationFieldsFor('R22-CAPTURE', subject.entityId)
  const reading = Number.parseInt(fields?.retestReadingDeciCelsius ?? '', 10)
  if (!range || Number.isNaN(reading)) return outcome('UNKNOWN', { retestReading: null })
  return passOrFail(isWithin(reading, range), { retestReadingDeciCelsius: reading, range })
}

export const coldChainLeafRules: Readonly<Record<string, LeafRule>> = {
  temperatureRangeDefined,
  vehicleCoversTemperatureRange,
  sensorRecordValid,
  inspectionRiskAssessed,
  riskSignalPresent,
  temperatureExcursionChecked,
  excursionBeyondTolerance,
  reworkRequestedByQuality,
  retestWithinRange,
}
