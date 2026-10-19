# Policy v1 (fictional)

This is a fictional internal transport policy for the proof of concept. It does not reflect the licensing, safety or customs rules of any real country. Every threshold lives in `mock-policy-parameters.json`; a missing parameter fails configuration validation, and no model may guess one at runtime.

The machine-readable form is `rules.json`. The table below is generated from it by `pnpm --filter @durable-jev/eval-runner policy:render`, and a test fails if this file is out of date. Edit `policy-v1.template.md`, `rule-descriptions.json` or `rules.json`, never this file.

## How to read a rule

- **Scope**: `order`, `cargoItem` (evaluated once per item) or `leg` (once per transport leg).
- **Status**: PASS, FAIL, UNKNOWN, NOT_APPLICABLE, ERROR, BLOCKED_DEPENDENCY, WAITING_HUMAN or INVALIDATED.
- **Prerequisites**: a rule whose prerequisites have not passed is BLOCKED_DEPENDENCY. Only a human gate itself is WAITING_HUMAN; anything that depends on it, directly or nested, is blocked.
- **Applies when**: if the condition does not hold, the rule is NOT_APPLICABLE. If the condition is still undecided, the rule is blocked.
- **Condition rules** (IDs with a suffix, such as `R04-COLD`) are PASS when the situation holds and NOT_APPLICABLE otherwise. They never FAIL.
- **Facts vs gates**: R18 and R19 record what was found (risk, excursion) as an observed value; their gate only says the check was done. Whether rework is needed is decided by the condition rules.
- **Combinators**: AND fails on any FAIL and is blocked while anything it needs is pending. OR passes on any PASS. NOT never turns UNKNOWN into PASS. ALL/ANY over an empty set is UNKNOWN, never a pass. NOT_APPLICABLE parts are ignored.

## Rules

| Rule | Scope | Type | Requirement | Prerequisites / combination | Applies when | Human role |
|---|---|---|---|---|---|---|
| R01 | order | code | Order and cargo items carry every mandatory field (shipment, customer, origin, destination, delivery window, at least one item and one leg, quote). | — | always | — |
| R02 | cargoItem | code | Each cargo item has a valid weight and dimensions within policy limits (grams and millimetres, integers). | R01 | always | — |
| R03 | cargoItem | Jev | The declared category is consistent with the free-text cargo description (Jev, Noul). | R01 | always | review: transport planner |
| R04 | cargoItem | code | The handling branch of each item is determined: general, cold chain, controlled or mixed. Incomplete branch data keeps it UNKNOWN. | R02, R03 | always | — |
| R04-COLD | cargoItem | code | Condition: the item needs cold chain handling. | R04 | always | — |
| R04-CONTROLLED | cargoItem | code | Condition: the item is controlled goods. | R04 | always | — |
| R05 | cargoItem | code | The whole consignment fits every planned vehicle by payload, and each item fits the cargo space. | R02 | always | — |
| R06 | order | code | Planned arrival of the final leg falls inside the customer delivery window. | — | always | — |
| R07 | order | code | Legs start at the origin, end at the destination, connect location to location, and leave at least the minimum connection time. | — | always | — |
| R08 | order | code | The evaluated revision and entity versions match the stored current versions. | R01 | always | — |
| R09 | cargoItem | code | A controlled item has a non-empty safety data sheet and controlled goods declaration. | — | R04-CONTROLLED | — |
| R10 | cargoItem | Jev | The controlled documents describe the same goods as the cargo description (Jev, Noul). | R09 | R04-CONTROLLED | review: compliance reviewer |
| R11 | cargoItem | code | Every leg carrier holds a controlled goods qualification valid through the planned arrival. | R09 | R04-CONTROLLED | — |
| R12 | order | decision table | The mixing matrix allows every combination of categories and controlled classes in the shipment. | R04 | ANY(cargoItem, R04-CONTROLLED) | — |
| R13 | order | human | A compliance reviewer has signed off this cargo, carrier and route. | R10, R11, R12 | ANY(cargoItem, R04-CONTROLLED) | compliance reviewer |
| R14 | cargoItem | combinator | Controlled branch ready: R09 to R13 all pass. | R09 AND R10 AND R11 AND R12 AND R13 | R04-CONTROLLED | — |
| R15 | cargoItem | code | A cold chain item has a defined target temperature range. | — | R04-COLD | — |
| R16 | cargoItem | code | Every planned vehicle's temperature control covers the item's range. | R15 | R04-COLD | — |
| R17 | cargoItem | code | The temperature sensor is calibrated through departure and its last reading is recent enough at departure. | R15 | R04-COLD | — |
| R18 | cargoItem | Jev | The inspection note has been assessed for packaging damage or cold chain risk (Jev, Choice). Records the signal as a fact. | — | R04-COLD | review: quality reviewer |
| R18-RISK | cargoItem | code | Condition: the inspection found a risk that needs rework. | R18 | R04-COLD | — |
| R19 | cargoItem | code | The temperature log has been checked for excursions. Records the longest continuous excursion as a fact. | R15, R17 | R04-COLD | — |
| R19-EXCURSION | cargoItem | code | Condition: an excursion exceeded the tolerated duration. | R19 | R04-COLD | — |
| R20 | cargoItem | human | A quality reviewer has decided how to handle the excursion; the decision may require rework. | — | R19-EXCURSION | quality reviewer |
| R20-REWORK | cargoItem | code | Condition: the quality decision requires rework. | R20 | R04-COLD | — |
| R21-REQUIRED | cargoItem | combinator | Condition: rework is required by the inspection risk or by the quality decision. | R18-RISK OR R20-REWORK | R04-COLD | — |
| R21 | cargoItem | human | The warehouse has repacked the item and uploaded evidence. | — | R21-REQUIRED | warehouse operator |
| R22-CAPTURE | cargoItem | human | The warehouse has captured a retest reading after rework. | R21 | R21-REQUIRED | warehouse operator |
| R22 | cargoItem | code | The retest reading lies inside the target range. | R22-CAPTURE | R21-REQUIRED | — |
| R23 | cargoItem | combinator | Cold chain branch ready: range, vehicle, sensor, assessments, and every required disposition, rework and retest. | R15 AND R16 AND R17 AND R18 AND R19 AND R20 AND R21 AND R22 | R04-COLD | — |
| R24 | leg | code | Each leg carrier serves both ends of the leg. | R07 | always | — |
| R25 | leg | code | Each leg vehicle belongs to the leg carrier and has temperature control when any item needs cold chain. | R05, R16 | always | — |
| R26 | leg | decision table | Every transfer hub supports the shipment's categories, including cold chain where needed. | R04, R07 | always | — |
| R27 | order | Jev | The customer's written restrictions allow the current route and handover (Jev, Noul). | — | always | review: transport planner |
| R28 | order | code | An alternative plan re-runs the plan checks before it can replace the current plan (used during rerouting). | — | always | — |
| R29 | order | code | The current plan has an active carrier reservation for its route version. | R06, R11, R24, R25, R26, R27 | always | — |
| R30 | order | combinator | Transport plan valid: capacity, timing, connections, per-leg checks, customer restrictions and reservation. | ALL(cargoItem, R05) AND R06 AND R07 AND ALL(leg, (R24 AND R25 AND R26)) AND R27 AND R28 AND R29 | always | — |
| R31 | order | code | The customer account is active. | — | always | — |
| R32 | order | code | The quote fits in the customer's remaining credit. | — | always | — |
| R33 | order | code | Applies only over credit: the excess is within the approvable exception limit. | — | NOT R32 | — |
| R34 | order | human | Applies only over credit: a commercial manager has approved the exception for this customer and quote. | R33 | NOT R32 | commercial manager |
| R35-REQUIRED | order | code | Condition: a reroute raised the cost above the approval threshold. | — | always | — |
| R35 | order | human | A commercial manager has approved the extra cost. | — | R35-REQUIRED | commercial manager |
| R36 | order | combinator | Commercial branch ready: R31 AND (R32 OR (R33 AND R34)) AND R35 where required. | R31 AND (R32 OR (R33 AND R34)) AND R35 | always | — |
| R37 | order | combinator | Every cargo item passes its base checks and every applicable branch; a controlled cold chain item needs both. | ALL(cargoItem, (R02 AND R03 AND R04 AND R05 AND R14 AND R23)) | always | — |
| R38 | order | combinator | Every applicable pre-load human gate is complete: compliance sign-off, quality disposition, repack, retest capture, credit and extra cost approvals. | R13 AND ALL(cargoItem, (R20 AND R21 AND R22-CAPTURE)) AND R34 AND R35 | always | — |
| R39-LOAD | order | human | The warehouse has scanned and physically checked the load. | R30, R36, R37, R38 | always | warehouse operator |
| R39-CONFIRM | order | human | The dispatcher has confirmed dispatch. | R39-LOAD | always | dispatcher |
| R39 | order | combinator | Loading and dispatcher confirmation are complete. | R39-LOAD AND R39-CONFIRM | always | — |
| R40 | order | combinator | The order may dispatch. Re-evaluated inside the dispatch transaction. | R08 AND R30 AND R36 AND R37 AND R38 AND R39 | always | — |

## Human tasks

- An approval records a decision; an operation records a field action with the listed evidence fields. Clicking approve never completes an operation.
- Every task is bound to the case revision, entity versions and an input fingerprint. A change to what the task covers supersedes it, whether it was open or already decided, and creates a new task. Old decisions are never reused.
- Only the required role may act. Expired, cancelled and superseded tasks are final.
- When an automated semantic judgement is uncertain, the rule escalates to the named reviewer, whose approval passes it and rejection fails it.

## Mixing matrix

See `decision-tables/mixing-matrix.json`. A shipment's tokens are its cargo categories plus `CONTROLLED:<class>` for each controlled class. Any forbidden pair present fails R12. An approval cannot override it; the shipment must be split or the cargo changed.

## Parameters

| Parameter | Value |
|---|---|
| `policyVersion` | policy-v1 |
| `maxCargoItemWeightGrams` | 1000000 |
| `maxCargoItemDimensionMm` | 3000 |
| `minLegConnectionMinutes` | 30 |
| `deliveryWindowToleranceMinutes` | 0 |
| `maxSensorRecordAgeMinutes` | 120 |
| `temperatureExcursionToleranceMinutes` | 30 |
| `creditExceptionLimitCents` | 500000 |
| `extraCostApprovalThresholdCents` | 50000 |
| `approvalTaskTtlMinutes` | 240 |
| `operationTaskTtlMinutes` | 480 |
| `semanticNoulPassAtLeast` | 0.8 |
| `semanticNoulFailAtMost` | 0.2 |
| `semanticChoiceMinProbability` | 0.6 |
