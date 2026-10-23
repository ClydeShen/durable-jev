# Shipment Release Policy

| Document No. | Version | Effective | Next review |
|---|---|---|---|
| QP-LOG-004 | 1.1 | 1 November 2026 | 1 November 2027 |

| Owner | Approved by | Classification |
|---|---|---|
| Head of Quality and Compliance | General Manager, Operations | Internal, controlled document |

Fictional document prepared for the Durable Jev Agent proof of concept. It follows the structure of a good distribution practice (GDP) procedure but does not state the transport, safety, customs or import rules of any real country or authority. A printed copy is uncontrolled.

## 1. Purpose

This policy sets the controls that must be met before a shipment is released for dispatch, so that every shipment leaves the site complete, correctly documented, safe to carry and within its commercial terms.

## 2. Scope

This policy applies to every outbound shipment planned or dispatched from a company warehouse. A shipment is one order with one or more cargo items and one to three transport legs. Each control applies to the whole order, to each cargo item or to each leg, as stated under "Applies to".

## 3. Definitions and conventions

| Term | Meaning |
|---|---|
| Must / must not | A mandatory requirement. |
| Control | One numbered requirement of this policy, identified by its reference (for example R13). |
| Prerequisite | A control that must be decided before this control is evaluated. |
| Release | The dispatcher's confirmation that a shipment may leave the site. |
| Excursion | A continuous period outside the declared temperature range. |
| Revision | A version of the order; a change to its cargo, route, carrier, quote or documents creates a new revision. |
| UNKNOWN | A control that cannot be decided because data is missing. It never counts as passed. |
| NOT_APPLICABLE | A control whose condition is not met. A control is not applicable only where this policy says so. |

Every threshold is a named parameter in `policy-parameters.json`. Quantities are integer grams, millimetres, cubic centimetres and tenths of a degree Celsius. Monetary amounts are in New Zealand dollar cents (NZD); a quote is issued in the currency agreed in the customer's contract (Schedule H). Every timestamp is UTC.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Warehouse operator | Inspects, repacks, retests and loads cargo and records the evidence. |
| Dispatcher | Confirms the release of a shipment that has passed every control. |
| Compliance reviewer | Signs off controlled goods. |
| Quality reviewer | Decides on temperature excursions and co-signs controlled cold-chain goods. |
| Commercial manager | Approves credit exceptions and extra costs. |
| Transport planner | Confirms changes to the transport plan. |

## Part A. Order and cargo basics

**R01 Order complete.** Applies to: the order. The order must name a customer and a delivery window and must have at least one cargo item and at least one leg.

**R02 Measurements valid.** Applies to: each cargo item. Prerequisite: R01. Weight, quantity, length, width, height and volume must be positive.

**R03 Description matches declaration.** Applies to: each cargo item. Prerequisite: R01. The free-text cargo description must describe goods of the declared categories (general, cold chain, controlled). Judged on the text; the control passes when the probability that it matches is at least `semanticMatchThreshold`.

**R04 Branch determined.** Applies to: each cargo item. Prerequisites: R02 and R03. The item's branches are its declared categories. If R02 or R03 does not pass, the branch is undetermined and every branch control waits.

**R05 Vehicle payload.** Applies to: each leg. Prerequisite: R02. The total weight of all cargo items must not exceed the payload of the leg's vehicle.

**R06 Delivery window.** Applies to: the order. The last leg must arrive within the customer's delivery window, both ends inclusive.

**R07 Leg sequence.** Applies to: each leg. Each leg must depart before it arrives, and every leg after the first must depart at least `minLegConnectionMinutes` after the previous leg arrives.

**R08 No conflicting identities.** Applies to: the order. Prerequisite: R01. Every cargo item must carry the order's shipment id.

## Part B. Controlled goods controls

Part B applies to cargo items whose branches include `controlled`.

**R09 Controlled documents present.** Applies to: each controlled cargo item. A safety data sheet and a controlled-goods declaration must be attached to the item.

**R10 Documents match the goods.** Applies to: each controlled cargo item. Prerequisite: R09. The safety data sheet must describe the same goods as the cargo description. Judged on the text; passes at `semanticMatchThreshold`.

**R11 Carrier qualified.** Applies to: each leg. Prerequisite: R09. The leg's carrier must hold the `CTRL` qualification, and it must not have expired at planned departure.

**R12 Mixing allowed.** Applies to: the order. Prerequisite: R04. The combination of all branches on the order must be allowed by the mixing matrix. `controlled` with `general` is forbidden. `controlled` with `coldChain` requires the carrier qualification `CTRL-COLD` on every leg. All other combinations are allowed. A forbidden mix cannot be approved away; the order must be split or changed.

**R13 Compliance sign-off.** Applies to: each controlled cargo item. Prerequisites: R10, R11 and R12. A compliance reviewer must approve the item for the current cargo, carrier and route versions. When the item is also cold chain, a quality reviewer must approve after the compliance reviewer. The two approvals must be given by different people. Approvals expire after `approvalExpiryHours`.

**R14 Controlled branch ready.** Applies to: each controlled cargo item. R09, R10, R11 and R13 must all pass.

## Part C. Cold chain controls

Part C applies to cargo items whose branches include `coldChain`.

**R15 Target range set.** Applies to: each cold-chain cargo item. The item must have a target temperature range whose minimum is not above its maximum.

**R16 Vehicle temperature capability.** Applies to: each leg. Prerequisite: R15. For every cold-chain item, the leg's vehicle must be temperature controlled and its range must cover the item's target range.

**R17 Sensor valid.** Applies to: each cold-chain cargo item. Prerequisite: R15. The item must have a calibrated sensor whose latest record is no older than `sensorRecordMaxAgeHours` before the first leg's planned departure.

**R18 Inspection risk signal.** Applies to: each cold-chain cargo item. The warehouse inspection note is read for signs of damaged packaging or compromised temperature control. The observed value is the signal found: `no_risk`, `damaged_packaging` or `cold_chain_risk`. Only `no_risk` passes; any risk requires repacking (R21).

**R19 Excursion within tolerance.** Applies to: each cold-chain cargo item. Prerequisites: R15 and R17. The temperature record must have no excursion longer than `excursionToleranceMinutes`.

**R20 Quality disposition.** Applies to: each cold-chain cargo item, only when R19 fails. A quality reviewer must decide whether the goods may still ship. When the item is also controlled, a compliance reviewer must approve after the quality reviewer. The two steps must be approved by different people.

**R21 Repacked.** Applies to: each cold-chain cargo item, only when R18 does not pass. A warehouse operator must repack the item and record the new packaging id and a photo reference.

**R22 Retest passed.** Applies to: each cold-chain cargo item. Prerequisite: R21. A warehouse operator must retest the repacked item and record the retest temperature and a photo reference; the temperature must be inside the target range.

**R23 Cold chain branch ready.** Applies to: each cold-chain cargo item. R15, R16 and R17 must pass, R19 must pass or R20 must be approved, and when repacking was required R21 and R22 must be complete.

## Part D. Transport plan controls

**R24 Service region.** Applies to: each leg. The carrier must serve both the origin and the destination region of the leg.

**R25 Vehicle volume.** Applies to: each leg. Prerequisite: R05. The total volume of all cargo items must fit the vehicle.

**R26 Transfer hub capability.** Applies to: each leg. When a leg ends at a transfer hub, the hub must handle every branch on the order (cold storage for cold chain, a secured cage for controlled).

**R27 Customer restrictions.** Applies to: the order. The customer's written restrictions, if any, must allow the current route and handover. Judged on the text; passes at `semanticMatchThreshold`.

**R28 Alternative plan check.** Applies to: each candidate plan. A proposed alternative plan must pass the same checks as the current plan for R05 to R07, R11, R16 and R24 to R27 before a planner may apply it. R28 is a template applied to candidate plans, not part of the release chain, so it cannot loop back into R30 or R40.

**R29 Transport reserved.** Applies to: each leg. Prerequisites: R05, R06, R07, R24 and R25. Capacity must be reserved with the carrier for the current plan version. Reserving twice for the same plan version has no effect.

**R30 Plan valid.** Applies to: the order. R06 must pass and, on every leg, R05, R07, R24, R25, R26 and R29 must pass.

## Part E. Commercial controls

**R31 Customer active.** Applies to: the order. The customer account must be active.

**R32 Within credit.** Applies to: the order. The quote plus extra costs must fit the remaining credit (limit minus outstanding balance).

**R33 Exception within limit.** Applies to: the order, only when R32 fails. The amount over credit must not exceed `creditExceptionLimitCents`.

**R34 Credit exception approved.** Applies to: the order. Prerequisite: R33. A commercial manager must approve the exception for the current quote. Above `secondCreditApprovalAboveCents` over credit, a second, different commercial manager must also approve.

**R35 Extra cost approved.** Applies to: the order. When extra costs exceed `extraCostApprovalThresholdCents`, a commercial manager must approve them for the current quote.

**R36 Commercial ready.** Applies to: the order. R31 and R27 must pass, R32 must pass or both R33 and R34 must pass, and R35 must pass when it applies.

## Part F. Release

**R37 Cargo ready.** Applies to: the order. Every cargo item must pass R02, R03 and R04, its controlled branch (R14) when controlled, and its cold chain branch (R23) when cold chain.

**R38 Pre-loading tasks valid.** Applies to: the order. Every pre-loading approval and operation that applies (R13, R20, R21, R22, R34, R35) must be complete for the current versions. Expired or superseded tasks do not count.

**R39 Loaded.** Applies to: the order. Prerequisites: R30, R36, R37 and R38. A warehouse operator must load the shipment and record the load scan id and the seal number.

**R40 Release allowed.** Applies to: the order. R08, R30, R36, R37, R38 and R39 must pass. A dispatcher confirms the release; the confirmation re-evaluates R40 against the current versions in the same transaction and only then marks the order dispatched.

## Schedule G. Destination import requirements

Illustrative requirements modelled on the structure of import health standards; they are not the requirements of the authorities named. Each requirement applies only to shipments to its destination whose cargo falls in its commodity group, so an order meets a handful of requirements and the rest are filtered out by lookup.

**R42 Commodity group.** Applies to: each cargo item. Each cargo item must be classified into the commodity groups pharmaceutical, food, lithiumBattery, chemical or general. Every group whose likelihood is at least `commodityInclusionThreshold` is selected, so an uncertain item selects more requirements, never fewer.

**R41 Destination requirements met.** Applies to: the order. Every selected destination requirement must pass.

**R40** is extended: release also requires R41.

### G.NZ New Zealand (Ministry for Primary Industries / Medsafe)

**DEST-NZ-PHARMA-1 Import permit for medicines.** Applies to: pharmaceutical cargo. An import permit (`importPermit`) must be on file.

**DEST-NZ-PHARMA-2 Cold chain at 8 °C or colder.** Applies to: pharmaceutical cargo. Every cold-chain item must declare a maximum temperature of 8 °C or colder.

**DEST-NZ-PHARMA-3 Medicine and manufacturer named.** Applies to: pharmaceutical cargo. The documents must name the medicine and its manufacturer.

**DEST-NZ-FOOD-1 Health certificate.** Applies to: food cargo. An official health certificate (`healthCertificate`) must be on file.

**DEST-NZ-FOOD-2 Origin evidence.** Applies to: food cargo. Origin must be evidenced by a `certificateOfOrigin`.

**DEST-NZ-FOOD-3 Storage condition stated.** Applies to: food cargo. The goods description or documents must state the storage condition or shelf life.

**DEST-NZ-LIBAT-1 UN38.3 test summary.** Applies to: lithium battery cargo. A UN38.3 test summary (`batteryTestSummary`) must be on file.

**DEST-NZ-LIBAT-2 Dangerous goods carrier.** Applies to: lithium battery cargo. Every leg must use a carrier qualified for dangerous goods (`DG`).

**DEST-NZ-LIBAT-3 Battery rating stated.** Applies to: lithium battery cargo. The documents must state the watt-hour rating or lithium content.

**DEST-NZ-CHEM-1 Safety data sheet.** Applies to: chemical cargo. A safety data sheet (`safetyDataSheet`) must be on file.

**DEST-NZ-CHEM-2 Hazardous substance clearance.** Applies to: chemical cargo. The hazardous substance clearance (`importPermit`) must be on file.

**DEST-NZ-CHEM-3 Hazard class named.** Applies to: chemical cargo. The safety data sheet must name the hazard class of the substance.

### G.AU Australia (Department of Agriculture / TGA)

**DEST-AU-PHARMA-1 Import permit for medicines.** Applies to: pharmaceutical cargo. An import permit (`importPermit`) must be on file.

**DEST-AU-PHARMA-2 Product registration.** Applies to: pharmaceutical cargo. The product registration (`productRegistration`) must be on file.

**DEST-AU-PHARMA-3 Medicine and manufacturer named.** Applies to: pharmaceutical cargo. The documents must name the medicine and its manufacturer.

**DEST-AU-FOOD-1 Health certificate.** Applies to: food cargo. An official health certificate (`healthCertificate`) must be on file.

**DEST-AU-FOOD-2 Origin evidence.** Applies to: food cargo. Origin must be evidenced by a `certificateOfOrigin`.

**DEST-AU-FOOD-3 Storage condition stated.** Applies to: food cargo. The goods description or documents must state the storage condition or shelf life.

**DEST-AU-LIBAT-1 UN38.3 test summary.** Applies to: lithium battery cargo. A UN38.3 test summary (`batteryTestSummary`) must be on file.

**DEST-AU-LIBAT-2 Dangerous goods carrier.** Applies to: lithium battery cargo. Every leg must use a carrier qualified for dangerous goods (`DG`).

**DEST-AU-LIBAT-3 Battery rating stated.** Applies to: lithium battery cargo. The documents must state the watt-hour rating or lithium content.

**DEST-AU-CHEM-1 Safety data sheet.** Applies to: chemical cargo. A safety data sheet (`safetyDataSheet`) must be on file.

**DEST-AU-CHEM-2 Hazardous substance clearance.** Applies to: chemical cargo. The hazardous substance clearance (`importPermit`) must be on file.

**DEST-AU-CHEM-3 Hazard class named.** Applies to: chemical cargo. The safety data sheet must name the hazard class of the substance.

### G.SG Singapore (Health Sciences Authority / Singapore Food Agency)

**DEST-SG-PHARMA-1 Import licence above 20 units.** Applies to: pharmaceutical cargo. A shipment of more than 20 units must carry an import licence (`importPermit`).

**DEST-SG-PHARMA-2 Product registration.** Applies to: pharmaceutical cargo. The product registration (`productRegistration`) must be on file.

**DEST-SG-PHARMA-3 Medicine and manufacturer named.** Applies to: pharmaceutical cargo. The documents must name the medicine and its manufacturer.

**DEST-SG-FOOD-1 Health certificate.** Applies to: food cargo. An official health certificate (`healthCertificate`) must be on file.

**DEST-SG-FOOD-2 Origin evidence.** Applies to: food cargo. Origin must be evidenced by a `commercialInvoice`.

**DEST-SG-FOOD-3 Storage condition stated.** Applies to: food cargo. The goods description or documents must state the storage condition or shelf life.

**DEST-SG-LIBAT-1 UN38.3 test summary.** Applies to: lithium battery cargo. A UN38.3 test summary (`batteryTestSummary`) must be on file.

**DEST-SG-LIBAT-2 Dangerous goods carrier.** Applies to: lithium battery cargo. Every leg must use a carrier qualified for dangerous goods (`DG`).

**DEST-SG-LIBAT-3 Battery rating stated.** Applies to: lithium battery cargo. The documents must state the watt-hour rating or lithium content.

**DEST-SG-CHEM-1 Safety data sheet.** Applies to: chemical cargo. A safety data sheet (`safetyDataSheet`) must be on file.

**DEST-SG-CHEM-2 Hazardous substance clearance.** Applies to: chemical cargo. The hazardous substance clearance (`controlledDeclaration`) must be on file.

**DEST-SG-CHEM-3 Hazard class named.** Applies to: chemical cargo. The safety data sheet must name the hazard class of the substance.

### G.JP Japan (Ministry of Health, Labour and Welfare)

**DEST-JP-PHARMA-1 Import licence above 20 units.** Applies to: pharmaceutical cargo. A shipment of more than 20 units must carry an import licence (`importPermit`).

**DEST-JP-PHARMA-2 Product registration.** Applies to: pharmaceutical cargo. The product registration (`productRegistration`) must be on file.

**DEST-JP-PHARMA-3 Medicine and manufacturer named.** Applies to: pharmaceutical cargo. The documents must name the medicine and its manufacturer.

**DEST-JP-FOOD-1 Health certificate.** Applies to: food cargo. An official health certificate (`healthCertificate`) must be on file.

**DEST-JP-FOOD-2 Origin evidence.** Applies to: food cargo. Origin must be evidenced by a `certificateOfOrigin`.

**DEST-JP-FOOD-3 Storage condition stated.** Applies to: food cargo. The goods description or documents must state the storage condition or shelf life.

**DEST-JP-LIBAT-1 UN38.3 test summary.** Applies to: lithium battery cargo. A UN38.3 test summary (`batteryTestSummary`) must be on file.

**DEST-JP-LIBAT-2 Dangerous goods carrier.** Applies to: lithium battery cargo. Every leg must use a carrier qualified for dangerous goods (`DG`).

**DEST-JP-LIBAT-3 Battery rating stated.** Applies to: lithium battery cargo. The documents must state the watt-hour rating or lithium content.

**DEST-JP-CHEM-1 Safety data sheet.** Applies to: chemical cargo. A safety data sheet (`safetyDataSheet`) must be on file.

**DEST-JP-CHEM-2 Hazardous substance clearance.** Applies to: chemical cargo. The hazardous substance clearance (`controlledDeclaration`) must be on file.

**DEST-JP-CHEM-3 Hazard class named.** Applies to: chemical cargo. The safety data sheet must name the hazard class of the substance.

### G.US United States (FDA / Customs and Border Protection)

**DEST-US-PHARMA-1 Import permit for medicines.** Applies to: pharmaceutical cargo. An import permit (`importPermit`) must be on file.

**DEST-US-PHARMA-2 Cold chain at 8 °C or colder.** Applies to: pharmaceutical cargo. Every cold-chain item must declare a maximum temperature of 8 °C or colder.

**DEST-US-PHARMA-3 Medicine and manufacturer named.** Applies to: pharmaceutical cargo. The documents must name the medicine and its manufacturer.

**DEST-US-FOOD-1 Health certificate.** Applies to: food cargo. An official health certificate (`healthCertificate`) must be on file.

**DEST-US-FOOD-2 Origin evidence.** Applies to: food cargo. Origin must be evidenced by a `certificateOfOrigin`.

**DEST-US-FOOD-3 Storage condition stated.** Applies to: food cargo. The goods description or documents must state the storage condition or shelf life.

**DEST-US-LIBAT-1 UN38.3 test summary.** Applies to: lithium battery cargo. A UN38.3 test summary (`batteryTestSummary`) must be on file.

**DEST-US-LIBAT-2 Dangerous goods carrier.** Applies to: lithium battery cargo. Every leg must use a carrier qualified for dangerous goods (`DG`).

**DEST-US-LIBAT-3 Battery rating stated.** Applies to: lithium battery cargo. The documents must state the watt-hour rating or lithium content.

**DEST-US-CHEM-1 Safety data sheet.** Applies to: chemical cargo. A safety data sheet (`safetyDataSheet`) must be on file.

**DEST-US-CHEM-2 Hazardous substance clearance.** Applies to: chemical cargo. The hazardous substance clearance (`controlledDeclaration`) must be on file.

**DEST-US-CHEM-3 Hazard class named.** Applies to: chemical cargo. The safety data sheet must name the hazard class of the substance.

### G.DE Germany (BfArM / Zoll)

**DEST-DE-PHARMA-1 Import permit for medicines.** Applies to: pharmaceutical cargo. An import permit (`importPermit`) must be on file.

**DEST-DE-PHARMA-2 Cold chain at 8 °C or colder.** Applies to: pharmaceutical cargo. Every cold-chain item must declare a maximum temperature of 8 °C or colder.

**DEST-DE-PHARMA-3 Medicine and manufacturer named.** Applies to: pharmaceutical cargo. The documents must name the medicine and its manufacturer.

**DEST-DE-FOOD-1 Health certificate.** Applies to: food cargo. An official health certificate (`healthCertificate`) must be on file.

**DEST-DE-FOOD-2 Origin evidence.** Applies to: food cargo. Origin must be evidenced by a `certificateOfOrigin`.

**DEST-DE-FOOD-3 Storage condition stated.** Applies to: food cargo. The goods description or documents must state the storage condition or shelf life.

**DEST-DE-LIBAT-1 UN38.3 test summary.** Applies to: lithium battery cargo. A UN38.3 test summary (`batteryTestSummary`) must be on file.

**DEST-DE-LIBAT-2 Dangerous goods carrier.** Applies to: lithium battery cargo. Every leg must use a carrier qualified for dangerous goods (`DG`).

**DEST-DE-LIBAT-3 Battery rating stated.** Applies to: lithium battery cargo. The documents must state the watt-hour rating or lithium content.

**DEST-DE-CHEM-1 Safety data sheet.** Applies to: chemical cargo. A safety data sheet (`safetyDataSheet`) must be on file.

**DEST-DE-CHEM-2 Hazardous substance clearance.** Applies to: chemical cargo. The hazardous substance clearance (`importPermit`) must be on file.

**DEST-DE-CHEM-3 Hazard class named.** Applies to: chemical cargo. The safety data sheet must name the hazard class of the substance.

## Schedule H. Customer contract terms

Terms taken from each customer's master services agreement. A term applies only to its own customer.

**R43 Contract terms met.** Applies to: the order. Every term of the order's customer must pass.

**R36** is extended: commercial readiness also requires R43.

### H.ACME Acme Office Supplies (CUS-ACME)

Source: Master Services Agreement MSA-2024-031, Schedule 2 (Service Specification).

**CUST-ACME-1 Handover.** Handover must be one of: `dock`, `customerSite`.

**CUST-ACME-2 Arrival margin.** The last leg must arrive at least 30 minutes before the delivery window closes.

**CUST-ACME-3 Extra cost cap.** Extra costs must not exceed NZD 500.00 (50000 cents).

**CUST-ACME-4 Invoice currency.** The quote must be issued in NZD.

### H.BRISK Brisk Retail Group (CUS-BRISK)

Source: Master Services Agreement MSA-2023-112, Schedule 2 (Service Specification).

**CUST-BRISK-1 Handover.** Handover must be one of: `dock`, `curbside`.

**CUST-BRISK-2 Arrival margin.** The last leg must arrive at least 0 minutes before the delivery window closes.

**CUST-BRISK-3 Extra cost cap.** Extra costs must not exceed NZD 15,000.00 (1500000 cents).

**CUST-BRISK-4 Invoice currency.** The quote must be issued in NZD.

### H.MEDI Southgate Clinics (CUS-MEDI)

Source: Master Services Agreement MSA-2025-014, Schedule 2 (Service Specification).

**CUST-MEDI-1 Handover.** Handover must be one of: `dock`.

**CUST-MEDI-2 Arrival margin.** The last leg must arrive at least 60 minutes before the delivery window closes.

**CUST-MEDI-3 Extra cost cap.** Extra costs must not exceed NZD 1,000.00 (100000 cents).

**CUST-MEDI-4 Invoice currency.** The quote must be issued in NZD.

**CUST-MEDI-5 Named recipient.** Medical goods must be handed to named clinic staff at the rear dock and must never be left unattended. A plan cannot show this, so before loading a warehouse operator must record the named recipient and the delivery note reference; the driver hands the goods to that person.

### H.NORDA Norda Foods (CUS-NORDA)

Source: Master Services Agreement MSA-2024-077, Schedule 2 (Service Specification).

**CUST-NORDA-1 Handover.** Handover must be one of: `dock`.

**CUST-NORDA-2 Arrival margin.** The last leg must arrive at least 120 minutes before the delivery window closes.

**CUST-NORDA-3 Extra cost cap.** Extra costs must not exceed NZD 200.00 (20000 cents).

**CUST-NORDA-4 Invoice currency.** The quote must be issued in NZD.

**CUST-NORDA-5 Contract clause.** Chilled food must go straight to the cold room and must not pass through a cross-dock.

### H.VOLT Voltaic Devices (CUS-VOLT)

Source: Master Services Agreement MSA-2025-006, Schedule 2 (Service Specification).

**CUST-VOLT-1 Handover.** Handover must be one of: `dock`, `customerSite`.

**CUST-VOLT-2 Arrival margin.** The last leg must arrive at least 30 minutes before the delivery window closes.

**CUST-VOLT-3 Extra cost cap.** Extra costs must not exceed NZD 500.00 (50000 cents).

**CUST-VOLT-4 Invoice currency.** The quote must be issued in USD.

**CUST-VOLT-5 Contract clause.** Battery-powered devices must travel only with carriers approved for dangerous goods.

### H.KAPA Kapa Chemicals (CUS-KAPA)

Source: Master Services Agreement MSA-2023-089, Schedule 2 (Service Specification).

**CUST-KAPA-1 Handover.** Handover must be one of: `dock`.

**CUST-KAPA-2 Arrival margin.** The last leg must arrive at least 60 minutes before the delivery window closes.

**CUST-KAPA-3 Extra cost cap.** Extra costs must not exceed NZD 400.00 (40000 cents).

**CUST-KAPA-4 Invoice currency.** The quote must be issued in NZD.

**CUST-KAPA-5 Contract clause.** Corrosive products must be delivered to the chemical store entrance, not the main reception.

### H.HARU Haru Trading (CUS-HARU)

Source: Master Services Agreement MSA-2025-022, Schedule 2 (Service Specification).

**CUST-HARU-1 Handover.** Handover must be one of: `dock`, `curbside`, `customerSite`.

**CUST-HARU-2 Arrival margin.** The last leg must arrive at least 0 minutes before the delivery window closes.

**CUST-HARU-3 Extra cost cap.** Extra costs must not exceed NZD 300.00 (30000 cents).

**CUST-HARU-4 Invoice currency.** The quote must be issued in JPY.

### H.OAK Oakline Furniture (CUS-OAK)

Source: Master Services Agreement MSA-2024-140, Schedule 2 (Service Specification).

**CUST-OAK-1 Handover.** Handover must be one of: `curbside`, `customerSite`.

**CUST-OAK-2 Arrival margin.** The last leg must arrive at least 0 minutes before the delivery window closes.

**CUST-OAK-3 Extra cost cap.** Extra costs must not exceed NZD 250.00 (25000 cents).

**CUST-OAK-4 Invoice currency.** The quote must be issued in NZD.

## Revision history

| Version | Date | Change | Approved by |
|---|---|---|---|
| 1.0 | 19 October 2026 | First issue. | General Manager, Operations |
| 1.1 | 23 October 2026 | Reissued in the controlled document format. Invoice currency for Acme, Brisk, Southgate Clinics, Kapa and Oakline changed from EUR to NZD; monetary amounts stated in NZD. Appendices G and H renamed Schedules G and H. | General Manager, Operations |
