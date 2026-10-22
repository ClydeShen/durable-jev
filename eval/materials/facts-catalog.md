# Facts catalog

What a rule's FEEL expressions can read. Units: integer grams, millimetres, cubic centimetres,
tenths of a degree Celsius (`DeciCelsius`), cents; timestamps are UTC ISO strings, compared with
`date and time(...)`.

## Context variables

| Variable | In scope | Meaning |
|---|---|---|
| `order` | always | the order |
| `cargoItems` | always | list of all cargo items (same fields as `item`) |
| `legs` | always | list of all legs in sequence order (same fields as `leg`); `legs[1]` is the first, `legs[-1]` the last |
| `item` | cargo item rules | the current cargo item |
| `leg` | leg rules | the current leg |
| `params` | always | policy parameters from `policy-parameters.json` |

## order

`caseId`, `shipmentId`, `customerId`, `handover` (`dock` / `curbside` / `customerSite`),
`deliveryWindow.from`, `deliveryWindow.to`,
`quote.amountCents`, `quote.extraCostCents`, `quote.currency`,
`customer.name`, `customer.active`, `customer.creditLimitCents`, `customer.outstandingCents`,
`customer.restrictionsText` (free text, empty when none).
`destinationCountry` (ISO 3166 alpha-2, the country whose import requirements apply),
`documents` (all case documents; each `documentId`, `kind`, `cargoItemId`, `text`;
`documents.kind` is the list of kinds).

## item

`cargoItemId`, `shipmentId`, `description` (free text), `declaredCategories` (list of `general`,
`coldChain`, `controlled`), `controlledClass`, `quantity`, `weightGrams` (whole line),
`dimensionsMillimetres.length|width|height` (one package), `volumeCubicCm` (whole line),
`temperatureRange.minDeciCelsius|maxDeciCelsius`, `documentKinds` (list), `documentTexts.<kind>`
(free text), `inspectionNote` (free text), `sensor.sensorId|calibrated|lastRecordAt`,
`temperatureLog.readings`, `temperatureLog.longestExcursionMinutes`.

## leg

`legId`, `sequence`, `origin`, `destination`, `originRegion`, `destinationRegion`,
`plannedDeparture`, `plannedArrival`, `transferHub` (null unless the leg ends at a transfer hub;
otherwise `hubId`, `name`, `coldStorage`, `securedCage`), `carrier.carrierId|name|serviceRegions|
qualifications|qualificationsValidUntil`, `vehicle.vehicleId|maxPayloadGrams|maxVolumeCubicCm|
temperatureControlled|minDeciCelsius|maxDeciCelsius`.

## Writing rules

- Structured conditions are `expression` rules: `passWhen` is FEEL that yields true or false;
  missing data yields null, which the engine treats as UNKNOWN. Add `observe` for the value a
  reviewer should see.
- Free-text judgements are `semantic` rules answered by Jev: a `noul` statement or a `choice`
  question, the `state` it reads (FEEL per field) and `passWhen`. Name thresholds with a policy
  parameter, for example `semanticMatchThreshold`.
- Approvals and field operations are `humanGate` rules; at most three approval steps, operations
  have one step and list the evidence fields.
- Combine results with `combinator` rules (`and`, `or`, `not`, `ifThen`, `allOf`, `anyOf`, `ref`,
  `observed`, `feel`).
- Branch rules apply via `appliesWhen`, for example `{ "op": "observed", "ruleId": "R04",
  "includes": "controlled" }`.
- Never use FEEL filters such as `list[condition]`; write `every x in list satisfies (not(applies)
  or condition)` instead.
- Every rule read in an expression is listed in `dependsOn`; every `params.X` is listed in
  `parameters`.
- Extension rules (`DEST-*`, `CUST-*`) declare `applicability` (`destinations`, `customers`,
  `commodityGroups`); only rules whose every declared dimension matches the order are evaluated,
  the rest are filtered by index lookup. Commodity groups are the labels R42 selects, so a rule
  selected by commodity group lists R42 in `dependsOn`.
