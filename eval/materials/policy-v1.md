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
record is no older than `sensorRecordMaxAgeHours` before the first leg's planned departure.

**R18 Inspection risk signal.** (cargo item) The warehouse inspection note is read for signs of
damaged packaging or compromised temperature control. The observed value is the signal found:
`no_risk`, `damaged_packaging` or `cold_chain_risk`. Only `no_risk` passes; any risk requires
repacking (R21).

**R19 Excursion within tolerance.** (cargo item, after R15 and R17) The temperature record has
no continuous period outside the target range longer than `excursionToleranceMinutes`.

**R20 Quality disposition.** (cargo item, only when R19 fails) A quality reviewer decides whether
the goods may still ship. When the item is also controlled, a compliance reviewer approves after
the quality reviewer. Different people approve the two steps.

**R21 Repacked.** (cargo item, only when R18 does not pass) A warehouse operator repacks the item and records the new packaging id and a photo reference.

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
checks as the current plan for R05–R07, R11, R16 and R24–R27 before a planner may apply it. R28
is a template applied to candidate plans, not a node of the release graph, so it cannot loop back
into R30 or R40.

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

## Appendix G. Destination import requirements

Extension pack modelled on import health standards. Each requirement applies only to
shipments to its destination whose cargo falls in its commodity group, so an order meets a
handful of the requirements and the rest are filtered out by lookup.

**R42 Commodity group.** (cargo item) Classify each cargo item into the commodity groups
pharmaceutical, food, lithiumBattery, chemical or general. Every group whose likelihood is at least
`commodityInclusionThreshold` is selected, so an uncertain item selects more requirements,
never fewer.

**R41 Destination requirements met.** (order) Every selected destination requirement passes.

**R40** additionally requires R41.

### G.NZ New Zealand (Ministry for Primary Industries / Medsafe)

**DEST-NZ-PHARMA-1 Import permit for medicines.** (pharmaceutical) An import permit (`importPermit`) is on file.

**DEST-NZ-PHARMA-2 Cold chain at 8 °C or colder.** (pharmaceutical) Every cold-chain item declares a maximum temperature of 8 °C or colder.

**DEST-NZ-PHARMA-3 Medicine and manufacturer named.** (pharmaceutical) The documents name the medicine and its manufacturer.

**DEST-NZ-FOOD-1 Health certificate.** (food) An official health certificate (`healthCertificate`) is on file.

**DEST-NZ-FOOD-2 Origin evidence.** (food) Origin is evidenced by a `certificateOfOrigin`.

**DEST-NZ-FOOD-3 Storage condition stated.** (food) The goods description or documents state the storage condition or shelf life.

**DEST-NZ-LIBAT-1 UN38.3 test summary.** (lithiumBattery) A UN38.3 test summary (`batteryTestSummary`) is on file.

**DEST-NZ-LIBAT-2 Dangerous goods carrier.** (lithiumBattery) Every leg uses a carrier qualified for dangerous goods (`DG`).

**DEST-NZ-LIBAT-3 Battery rating stated.** (lithiumBattery) The documents state the watt-hour rating or lithium content.

**DEST-NZ-CHEM-1 Safety data sheet.** (chemical) A safety data sheet (`safetyDataSheet`) is on file.

**DEST-NZ-CHEM-2 Hazardous substance clearance.** (chemical) The hazardous substance clearance (`importPermit`) is on file.

**DEST-NZ-CHEM-3 Hazard class named.** (chemical) The safety data sheet names the hazard class of the substance.

### G.AU Australia (Department of Agriculture / TGA)

**DEST-AU-PHARMA-1 Import permit for medicines.** (pharmaceutical) An import permit (`importPermit`) is on file.

**DEST-AU-PHARMA-2 Product registration.** (pharmaceutical) The product registration (`productRegistration`) is on file.

**DEST-AU-PHARMA-3 Medicine and manufacturer named.** (pharmaceutical) The documents name the medicine and its manufacturer.

**DEST-AU-FOOD-1 Health certificate.** (food) An official health certificate (`healthCertificate`) is on file.

**DEST-AU-FOOD-2 Origin evidence.** (food) Origin is evidenced by a `certificateOfOrigin`.

**DEST-AU-FOOD-3 Storage condition stated.** (food) The goods description or documents state the storage condition or shelf life.

**DEST-AU-LIBAT-1 UN38.3 test summary.** (lithiumBattery) A UN38.3 test summary (`batteryTestSummary`) is on file.

**DEST-AU-LIBAT-2 Dangerous goods carrier.** (lithiumBattery) Every leg uses a carrier qualified for dangerous goods (`DG`).

**DEST-AU-LIBAT-3 Battery rating stated.** (lithiumBattery) The documents state the watt-hour rating or lithium content.

**DEST-AU-CHEM-1 Safety data sheet.** (chemical) A safety data sheet (`safetyDataSheet`) is on file.

**DEST-AU-CHEM-2 Hazardous substance clearance.** (chemical) The hazardous substance clearance (`importPermit`) is on file.

**DEST-AU-CHEM-3 Hazard class named.** (chemical) The safety data sheet names the hazard class of the substance.

### G.SG Singapore (Health Sciences Authority / Singapore Food Agency)

**DEST-SG-PHARMA-1 Import licence above 20 units.** (pharmaceutical) Shipments of more than 20 units carry an import licence (`importPermit`).

**DEST-SG-PHARMA-2 Product registration.** (pharmaceutical) The product registration (`productRegistration`) is on file.

**DEST-SG-PHARMA-3 Medicine and manufacturer named.** (pharmaceutical) The documents name the medicine and its manufacturer.

**DEST-SG-FOOD-1 Health certificate.** (food) An official health certificate (`healthCertificate`) is on file.

**DEST-SG-FOOD-2 Origin evidence.** (food) Origin is evidenced by a `commercialInvoice`.

**DEST-SG-FOOD-3 Storage condition stated.** (food) The goods description or documents state the storage condition or shelf life.

**DEST-SG-LIBAT-1 UN38.3 test summary.** (lithiumBattery) A UN38.3 test summary (`batteryTestSummary`) is on file.

**DEST-SG-LIBAT-2 Dangerous goods carrier.** (lithiumBattery) Every leg uses a carrier qualified for dangerous goods (`DG`).

**DEST-SG-LIBAT-3 Battery rating stated.** (lithiumBattery) The documents state the watt-hour rating or lithium content.

**DEST-SG-CHEM-1 Safety data sheet.** (chemical) A safety data sheet (`safetyDataSheet`) is on file.

**DEST-SG-CHEM-2 Hazardous substance clearance.** (chemical) The hazardous substance clearance (`controlledDeclaration`) is on file.

**DEST-SG-CHEM-3 Hazard class named.** (chemical) The safety data sheet names the hazard class of the substance.

### G.JP Japan (Ministry of Health, Labour and Welfare)

**DEST-JP-PHARMA-1 Import licence above 20 units.** (pharmaceutical) Shipments of more than 20 units carry an import licence (`importPermit`).

**DEST-JP-PHARMA-2 Product registration.** (pharmaceutical) The product registration (`productRegistration`) is on file.

**DEST-JP-PHARMA-3 Medicine and manufacturer named.** (pharmaceutical) The documents name the medicine and its manufacturer.

**DEST-JP-FOOD-1 Health certificate.** (food) An official health certificate (`healthCertificate`) is on file.

**DEST-JP-FOOD-2 Origin evidence.** (food) Origin is evidenced by a `certificateOfOrigin`.

**DEST-JP-FOOD-3 Storage condition stated.** (food) The goods description or documents state the storage condition or shelf life.

**DEST-JP-LIBAT-1 UN38.3 test summary.** (lithiumBattery) A UN38.3 test summary (`batteryTestSummary`) is on file.

**DEST-JP-LIBAT-2 Dangerous goods carrier.** (lithiumBattery) Every leg uses a carrier qualified for dangerous goods (`DG`).

**DEST-JP-LIBAT-3 Battery rating stated.** (lithiumBattery) The documents state the watt-hour rating or lithium content.

**DEST-JP-CHEM-1 Safety data sheet.** (chemical) A safety data sheet (`safetyDataSheet`) is on file.

**DEST-JP-CHEM-2 Hazardous substance clearance.** (chemical) The hazardous substance clearance (`controlledDeclaration`) is on file.

**DEST-JP-CHEM-3 Hazard class named.** (chemical) The safety data sheet names the hazard class of the substance.

### G.US United States (FDA / Customs and Border Protection)

**DEST-US-PHARMA-1 Import permit for medicines.** (pharmaceutical) An import permit (`importPermit`) is on file.

**DEST-US-PHARMA-2 Cold chain at 8 °C or colder.** (pharmaceutical) Every cold-chain item declares a maximum temperature of 8 °C or colder.

**DEST-US-PHARMA-3 Medicine and manufacturer named.** (pharmaceutical) The documents name the medicine and its manufacturer.

**DEST-US-FOOD-1 Health certificate.** (food) An official health certificate (`healthCertificate`) is on file.

**DEST-US-FOOD-2 Origin evidence.** (food) Origin is evidenced by a `certificateOfOrigin`.

**DEST-US-FOOD-3 Storage condition stated.** (food) The goods description or documents state the storage condition or shelf life.

**DEST-US-LIBAT-1 UN38.3 test summary.** (lithiumBattery) A UN38.3 test summary (`batteryTestSummary`) is on file.

**DEST-US-LIBAT-2 Dangerous goods carrier.** (lithiumBattery) Every leg uses a carrier qualified for dangerous goods (`DG`).

**DEST-US-LIBAT-3 Battery rating stated.** (lithiumBattery) The documents state the watt-hour rating or lithium content.

**DEST-US-CHEM-1 Safety data sheet.** (chemical) A safety data sheet (`safetyDataSheet`) is on file.

**DEST-US-CHEM-2 Hazardous substance clearance.** (chemical) The hazardous substance clearance (`controlledDeclaration`) is on file.

**DEST-US-CHEM-3 Hazard class named.** (chemical) The safety data sheet names the hazard class of the substance.

### G.DE Germany (BfArM / Zoll)

**DEST-DE-PHARMA-1 Import permit for medicines.** (pharmaceutical) An import permit (`importPermit`) is on file.

**DEST-DE-PHARMA-2 Cold chain at 8 °C or colder.** (pharmaceutical) Every cold-chain item declares a maximum temperature of 8 °C or colder.

**DEST-DE-PHARMA-3 Medicine and manufacturer named.** (pharmaceutical) The documents name the medicine and its manufacturer.

**DEST-DE-FOOD-1 Health certificate.** (food) An official health certificate (`healthCertificate`) is on file.

**DEST-DE-FOOD-2 Origin evidence.** (food) Origin is evidenced by a `certificateOfOrigin`.

**DEST-DE-FOOD-3 Storage condition stated.** (food) The goods description or documents state the storage condition or shelf life.

**DEST-DE-LIBAT-1 UN38.3 test summary.** (lithiumBattery) A UN38.3 test summary (`batteryTestSummary`) is on file.

**DEST-DE-LIBAT-2 Dangerous goods carrier.** (lithiumBattery) Every leg uses a carrier qualified for dangerous goods (`DG`).

**DEST-DE-LIBAT-3 Battery rating stated.** (lithiumBattery) The documents state the watt-hour rating or lithium content.

**DEST-DE-CHEM-1 Safety data sheet.** (chemical) A safety data sheet (`safetyDataSheet`) is on file.

**DEST-DE-CHEM-2 Hazardous substance clearance.** (chemical) The hazardous substance clearance (`importPermit`) is on file.

**DEST-DE-CHEM-3 Hazard class named.** (chemical) The safety data sheet names the hazard class of the substance.

## Appendix H. Customer contract terms

Clauses from customer framework agreements. A clause applies only to its own customer.

**R43 Contract terms met.** (order) Every clause of the order's customer passes.

**R36** additionally requires R43.

### H.ACME Acme Office Supplies (CUS-ACME)

**CUST-ACME-1 Handover.** Handover is one of dock, customerSite.

**CUST-ACME-2 Arrival margin.** The last leg arrives at least 30 minutes before the delivery window closes.

**CUST-ACME-3 Extra cost cap.** Extra costs stay at or below 50000 cents.

**CUST-ACME-4 Invoice currency.** The quote is in EUR.

### H.BRISK Brisk Retail Group (CUS-BRISK)

**CUST-BRISK-1 Handover.** Handover is one of dock, curbside.

**CUST-BRISK-2 Arrival margin.** The last leg arrives at least 0 minutes before the delivery window closes.

**CUST-BRISK-3 Extra cost cap.** Extra costs stay at or below 1500000 cents.

**CUST-BRISK-4 Invoice currency.** The quote is in EUR.

### H.MEDI Southgate Clinics (CUS-MEDI)

**CUST-MEDI-1 Handover.** Handover is one of dock.

**CUST-MEDI-2 Arrival margin.** The last leg arrives at least 60 minutes before the delivery window closes.

**CUST-MEDI-3 Extra cost cap.** Extra costs stay at or below 100000 cents.

**CUST-MEDI-4 Invoice currency.** The quote is in EUR.

**CUST-MEDI-5 Contract clause.** Medical goods are handed to named clinic staff at the rear dock and are never left unattended.

### H.NORDA Norda Foods (CUS-NORDA)

**CUST-NORDA-1 Handover.** Handover is one of dock.

**CUST-NORDA-2 Arrival margin.** The last leg arrives at least 120 minutes before the delivery window closes.

**CUST-NORDA-3 Extra cost cap.** Extra costs stay at or below 20000 cents.

**CUST-NORDA-4 Invoice currency.** The quote is in NZD.

**CUST-NORDA-5 Contract clause.** Chilled food goes straight to the cold room and never through a cross-dock.

### H.VOLT Voltaic Devices (CUS-VOLT)

**CUST-VOLT-1 Handover.** Handover is one of dock, customerSite.

**CUST-VOLT-2 Arrival margin.** The last leg arrives at least 30 minutes before the delivery window closes.

**CUST-VOLT-3 Extra cost cap.** Extra costs stay at or below 50000 cents.

**CUST-VOLT-4 Invoice currency.** The quote is in USD.

**CUST-VOLT-5 Contract clause.** Battery-powered devices travel only with carriers approved for dangerous goods.

### H.KAPA Kapa Chemicals (CUS-KAPA)

**CUST-KAPA-1 Handover.** Handover is one of dock.

**CUST-KAPA-2 Arrival margin.** The last leg arrives at least 60 minutes before the delivery window closes.

**CUST-KAPA-3 Extra cost cap.** Extra costs stay at or below 40000 cents.

**CUST-KAPA-4 Invoice currency.** The quote is in EUR.

**CUST-KAPA-5 Contract clause.** Corrosive products are delivered to the chemical store entrance, not the main reception.

### H.HARU Haru Trading (CUS-HARU)

**CUST-HARU-1 Handover.** Handover is one of dock, curbside, customerSite.

**CUST-HARU-2 Arrival margin.** The last leg arrives at least 0 minutes before the delivery window closes.

**CUST-HARU-3 Extra cost cap.** Extra costs stay at or below 30000 cents.

**CUST-HARU-4 Invoice currency.** The quote is in JPY.

### H.OAK Oakline Furniture (CUS-OAK)

**CUST-OAK-1 Handover.** Handover is one of curbside, customerSite.

**CUST-OAK-2 Arrival margin.** The last leg arrives at least 0 minutes before the delivery window closes.

**CUST-OAK-3 Extra cost cap.** Extra costs stay at or below 25000 cents.

**CUST-OAK-4 Invoice currency.** The quote is in EUR.
