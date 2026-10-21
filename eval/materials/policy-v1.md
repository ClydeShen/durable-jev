# Shipment Release Policy v1

Fictional internal policy for the Durable Jev Agent proof of concept. It does not describe the
transport, safety or customs rules of any real country. Every threshold is a named parameter in
`policy-parameters.json`; units are integer grams, millimetres, cubic centimetres, tenths of a
degree Celsius and cents, and every timestamp is UTC.

An order is one shipment with one or more cargo items and one to three transport legs. A rule
applies to the whole order, to each cargo item, or to each leg. A rule that cannot be decided
because data is missing is UNKNOWN; it never counts as passed. A rule whose precondition is not
met is NOT_APPLICABLE only when this policy says so explicitly.

## Part A. Order and cargo basics

**R01 Order complete.** (order) The order names a customer and a delivery window, and has at
least one cargo item and at least one leg.

**R02 Measurements valid.** (cargo item, after R01) Weight, quantity, length, width, height and
volume are positive.

**R03 Description matches declaration.** (cargo item, after R01) The free-text cargo description
describes goods of the declared categories (general, cold chain, controlled). Judged on the
text; pass when the probability that it matches is at least `semanticMatchThreshold`.

**R04 Branch determined.** (cargo item, after R02 and R03) The item's branches are its declared
categories. If R02 or R03 is not passed the branch is undetermined and every branch rule waits.

**R05 Vehicle payload.** (leg, after R02) The total weight of all cargo items does not exceed the
payload of the leg's vehicle.

**R06 Delivery window.** (order) The last leg arrives within the customer's delivery window,
both ends inclusive.

**R07 Leg sequence.** (leg) Each leg departs before it arrives, and every leg after the first
departs at least `minLegConnectionMinutes` after the previous leg arrives.

**R08 No conflicting identities.** (order, after R01) Every cargo item carries the order's
shipment id.

## Part B. Controlled goods branch

Applies to cargo items whose branches include `controlled`.

**R09 Controlled documents present.** (cargo item) A safety data sheet and a controlled-goods
declaration are attached to the item.

**R10 Documents match the goods.** (cargo item, after R09) The safety data sheet describes the
same goods as the cargo description. Judged on the text; pass at `semanticMatchThreshold`.

**R11 Carrier qualified.** (leg, after R09) The leg's carrier holds the `CTRL` qualification and
it has not expired at planned departure.

**R12 Mixing allowed.** (order, after R04) The combination of all branches on the order is
allowed by the mixing matrix. `controlled` with `general` is forbidden. `controlled` with
`coldChain` requires the carrier qualification `CTRL-COLD` on every leg. All other combinations
are allowed. A forbidden mix cannot be approved away; the order must be split or changed.

**R13 Compliance sign-off.** (cargo item, after R10, R11 and R12) A compliance reviewer approves
the item for the current cargo, carrier and route versions. When the item is also cold chain, a
quality reviewer approves after the compliance reviewer. The two approvals are by different
people. Approvals expire after `approvalExpiryHours`.

**R14 Controlled branch ready.** (cargo item) R09, R10, R11, R13 all pass.

## Part C. Cold chain branch

Applies to cargo items whose branches include `coldChain`.

**R15 Target range set.** (cargo item) The item has a target temperature range whose minimum is
not above its maximum.

**R16 Vehicle temperature capability.** (leg, after R15) For every cold chain item, the leg's
vehicle is temperature controlled and its range covers the item's target range.

**R17 Sensor valid.** (cargo item, after R15) The item has a calibrated sensor whose latest
record is no older than `sensorRecordMaxAgeHours` at evaluation time.

**R18 Inspection risk signal.** (cargo item) The warehouse inspection note is read for signs of
damaged packaging or compromised temperature control. The observed value is the signal found:
`no_risk`, `damaged_packaging` or `cold_chain_risk`. Only `no_risk` passes; any risk requires
repacking (R21).

**R19 Excursion within tolerance.** (cargo item, after R15 and R17) The temperature record has
no continuous period outside the target range longer than `excursionToleranceMinutes`.

**R20 Quality disposition.** (cargo item, only when R19 fails) A quality reviewer decides whether
the goods may still ship. When the item is also controlled, a compliance reviewer approves after
the quality reviewer. Different people approve the two steps.

**R21 Repacked.** (cargo item, only when R18 does not pass or the disposition requires it) A
warehouse operator repacks the item and records the new packaging id and a photo reference.

**R22 Retest passed.** (cargo item, after R21) A warehouse operator retests the repacked item and
records the retest temperature and a photo reference; the temperature is inside the target range.

**R23 Cold chain branch ready.** (cargo item) R15, R16, R17 pass, R19 passes or R20 is approved,
and when repacking was required R21 and R22 are complete.

## Part D. Transport plan

**R24 Service region.** (leg) The carrier serves both the origin and the destination region of
the leg.

**R25 Vehicle volume.** (leg, after R05) The total volume of all cargo items fits the vehicle.

**R26 Transfer hub capability.** (leg) When a leg ends at a transfer hub, the hub handles every
branch on the order (cold storage for cold chain, a secured cage for controlled).

**R27 Customer restrictions.** (order) The customer's written restrictions, if any, allow the
current route and handover. Judged on the text; pass at `semanticMatchThreshold`.

**R28 Alternative plan check.** (candidate plan) A proposed alternative plan passes the same
checks as the current plan for R05–R07, R11, R16 and R24–R27 before a planner may apply it.

**R29 Transport reserved.** (leg, after R05, R06, R07, R24 and R25) Capacity is reserved with the
carrier for the current plan version. Reserving twice for the same plan version has no effect.

**R30 Plan valid.** (order) R06 passes and, on every leg, R05, R07, R24, R25, R26 and R29 pass.

## Part E. Commercial

**R31 Customer active.** (order) The customer account is active.

**R32 Within credit.** (order) The quote plus extra costs fits the remaining credit (limit minus
outstanding balance).

**R33 Exception within limit.** (order, only when R32 fails) The amount over credit does not
exceed `creditExceptionLimitCents`.

**R34 Credit exception approved.** (order, after R33) A commercial manager approves the exception
for the current quote. Above `secondCreditApprovalAboveCents` over credit, a second, different
commercial manager also approves.

**R35 Extra cost approved.** (order) When extra costs exceed `extraCostApprovalThresholdCents`, a
commercial manager approves them for the current quote.

**R36 Commercial ready.** (order) R31 and R27 pass, R32 passes or both R33 and R34 pass, and
R35 passes when it applies.

## Part F. Release

**R37 Cargo ready.** (order) Every cargo item passes R02, R03 and R04, its controlled branch
(R14) when controlled, and its cold chain branch (R23) when cold chain.

**R38 Pre-loading tasks valid.** (order) Every pre-loading approval and operation that applies
(R13, R20, R21, R22, R34, R35) is complete for the current versions. Expired or superseded tasks
do not count.

**R39 Loaded.** (order, after R30, R36, R37 and R38) A warehouse operator loads the shipment and
records the load scan id and the seal number.

**R40 Release allowed.** (order) R08, R30, R36, R37, R38 and R39 pass. A dispatcher confirms the
release; the confirmation re-evaluates R40 against the current versions in the same transaction
and only then marks the order dispatched.
