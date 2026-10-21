# Live tuning log (T7.0)

Live models: Jev `jev-1.14.0` for every semantic rule and the R42 classifier; NVIDIA
`nemotron-3.5-lightning-30b-a3b` for the transport investigation helper. Only question wording,
option descriptions, state fields and thresholds were changed; no model was trained. Every
changed rule got a new `version` and `promptVersion`.

Measured on the development set: the 8 demo cases (44 live semantic outcomes) and 26 screening
samples. **No blind set exists yet**, so these are development-set numbers.

| Metric | Baseline | Round 1 | Round 2 | Round 3 |
|---|---|---|---|---|
| Live semantic outcomes that disagree with the intended story | 14 / 44 | 6 / 44 | 6 / 44 | 6 / 44 (no change made) |
| Screening samples with a missed rule (`pnpm screening`) | 5 / 26 | 1 / 26 | 1 / 26 | 1 / 26 |
| Failing live replay steps (`MODEL_MODE=live pnpm replay`) | 41 | 30 | 30 | 30 |
| Investigation helper proposes Frostline 06:30 in LOG-004 | yes | yes | yes | yes |

## Round 1

| Change | Why | Effect |
|---|---|---|
| R42 question asks for all groups an import authority would use; options name the borderline goods (diagnostic kits, sanitisers, supplements, pet food); `commodityInclusionThreshold` 0.25 → 0.15 | Jev answered borderline items with one confident label (vitamin gummies food 0.96, pharmaceutical 0.03) | Misses 5 → 1; gummies now food 0.61 / pharmaceutical 0.37 |
| R27 sees the planned arrival time; asks whether the plan breaks any written restriction | The MEDI restriction is about the dock and a time window, and the time was not in the state | 0.63–0.72 → pass |
| R03 defines general / coldChain / controlled | Statement listed the category names without meaning (garden furniture 0.69) | Pass |
| DEST-*-PHARMA-3 asks for the product, not "the medicine" | Diagnostic kits and reagents are not medicines | AU 0.53 → 0.95 |
| LOG-003: corrected SDS gives UN 3265, class 8; script expects FAIL for the wrong SDS | Live Jev was right (the original SDS describes batteries); the scripted 0.88 was wrong | Matches |

## Round 2

| Change | Effect |
|---|---|
| DEST-*-PHARMA-3: a generic product name is enough | DE 0.77 → 0.80, at the threshold, so it can still flip between runs |
| CUST-*-5: judge only what the plan shows; on-site duties are checked at delivery | MEDI 0.53–0.64 → 0.47–0.58, still failing |

## Round 3

Probe only: asking whether the plan *contradicts* the MEDI clause gives dock 0.58, customer site
0.47, curbside 0.95. Jev cannot separate a compliant plan from a non-compliant one, so no wording
can make the clause a plan-time check. No change was made.

## Open findings

1. **CUST-MEDI-5 is the wrong kind of rule.** "Handed to named clinic staff, never left
   unattended" is a duty at delivery. Its plan-time part (dock handover) is already CUST-MEDI-1.
   Recommendation: drop it from the plan-time checks, or turn it into a human gate at delivery.
   It is the only remaining live failure in LOG-002, 004, 006 and 008.
2. **LOG-007 / S24 expected groups.** Live Jev classes chilled diagnostic reagents as
   pharmaceutical only (chemical 0.06), and the SDS says they are not hazardous. The draft
   expectation (pharmaceutical + chemical) needs a reviewer's decision.
3. DEST-DE-PHARMA-3 sits at the threshold (0.80) on LOG-007; a more specific product name in the
   permit would make it robust.
