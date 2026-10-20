# Live Jev checks

Development and tests use scripted answers, so they never spend quota. Once per phase, after the phase works end to end, the demo cases are run once against real Jev (`MODEL_MODE=live`), and then the project goes back to scripted mode. Each run is recorded here: what was asked, how many calls it cost, how the answers compared with the scripted ones, and what we change because of it.

Live answers are cached in `var/data/semantic-cache.sqlite`, so repeating a run costs nothing unless a question or its input changes.

## How to run one

```bash
MODEL_MODE=live pnpm replay            # all cases, or name some: pnpm replay LOG-002 LOG-003
MODEL_MODE=live pnpm start             # optional: the workbench with live Jev
```

Stop the workbench afterwards; nothing else needs to be switched back, since scripted is the default.

## P4 · 2026-10-20 · LOG-002 and LOG-003 (T4.3 acceptance)

8 judgements, `jev-1.14.0`.

| Rule | Case | First run | After the fix |
|---|---|---|---|
| R03 declared category | LOG-003 (lithium batteries declared CONTROLLED) | 0.72, sent to a person | 0.97 |
| R27 customer restrictions | LOG-002 (clinic pharmacy, keep refrigerated) | 0.75, sent to a person | 0.81 |
| R10 documents match cargo | LOG-003 | 0.21 (mismatch, as intended) | unchanged |
| R18 inspection risk | LOG-002 | damaged_packaging, 1.0 | unchanged |

Finding: Jev hedges when it only sees codes. Fix: questions now carry category definitions, location names, carrier names and the vehicle's temperature range. Thresholds were not changed.

## P4 · 2026-10-20 · all eight cases, plus the workbench

About 13 new judgements for the replay and about 20 more for the workbench (each service keeps its own cache). 5 of 8 cases matched the expected results.

| Rule | Case | Live | Scripted | Assessment |
|---|---|---|---|---|
| R18 | LOG-004, 006, 007 | no_risk, 0.99 to 1.0 | no_risk | Agrees |
| R10 | LOG-004 | 0.89 | 0.9 | Agrees |
| R03 | most items | 0.94 to 0.98 | 0.93 to 0.97 | Agrees |
| R27 | LOG-001 (dock 3, call 30 minutes ahead) | 0.58 to 0.62, sent to a person | 0.92 | Our question is wrong: it asks whether the instructions allow the route, and these instructions say nothing about the route |
| R03 | LOG-005 (hospital beds, GENERAL) | 0.76 in one run, 0.81 in another | 0.96 | Same input crosses the 0.8 threshold between runs |
| R18 | LOG-008 ("gel packs partly thawed") | cold_chain_risk, 1.0 | no_risk | Jev is right; our draft label is wrong |

Improvements that follow:

- Ask R27 as "do the instructions forbid or restrict this route" (pending the user's decision; T7.0).
- Relabel LOG-008's inspection note as a cold chain risk (pending the user's review of the drafts).
- Consider a review band around the Noul thresholds (for example 0.75 to 0.85 goes to a person) and measure flip rates in B1.
