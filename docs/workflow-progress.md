# Durable domain-agent workflow: post-baseline progress

The owner authorized implementation after verifying the baseline, with a remote recovery point
at each demonstrated stage. Work starts from `baseline-2026-10-24-r2`
(`57373a8f261a0ded9e4b8a24cebbed481fc8b972`) on `feat/durable-policy-workflow`.
The original demo and both baseline archives remain unchanged. The baseline manifest describes
the frozen reference, not the evolving candidate. All work below is post-baseline effort.

## Stages and evidence

| Stage | Demonstration | Technical CEO's evidence | Non-technical CEO's evidence |
|---|---|---|---|
| W1: logistics policy continuity | Change a surcharge threshold; retain or re-evaluate old orders; restart and finish the same order | Complete diff, input hashes, SQLite recovery, stale-task decisions, release and side-effect checks | Which approvals remain or repeat, whether work is lost, observed limitations |
| W2: bounded agentic investigation | Vary evidence/offers; investigator selects tools and proposes an alternative; human confirms; recover after interruption | Authored orchestration versus model-selected steps, Pi checkpoints versus domain transactions, fixed-workflow control | Tasks the agent can resolve, human intervention, completion and recovery evidence |
| W3: motor-insurance adaptation | One bounded synthetic claims policy uses the same execution path | Domain materials and special logic, wiring and shared-core diff/cost | Work needed to change industry, reusable capabilities and unsupported claims |
| W4: synthesis and optional A2A | Compare reviewed authoring and held-out outcomes; optionally delegate vehicle insurance from logistics | Comparison protocol, independent custody, transport interchangeability | Measured change effort, suitability and limits; no enterprise price extrapolation |

W1 precedes insurance. W2 deepens T3.2a/T7.2 without requiring a new framework or moving every
business transition into Pi. Each stage ends with checks, an evidence record, a small commit and
an immutable annotated recovery tag plus backup branch. Do not move earlier refs. No PR or merge
is implied. Keep the current UI layout and existing package/folder boundaries.

## W1 mutation specification (draft)

P1 changes R35's additional transportation cost approval threshold from NZD 500 to NZD 750.
Only amounts strictly above the threshold need a commercial manager's approval. New orders use
the candidate pack. Existing unshipped orders either retain their original pack or explicitly
re-evaluate using the candidate pack; run and record both owner-selected activation modes.

Keep the parameter-only variant to expose the baseline's stale-task behavior. Compare it with
the existing rule-version discipline: change the threshold and increment R35's version. Under
that discipline, an NZD 800 previously approved order may need reapproval even though it exceeds
both limits. Report that additional work rather than hiding it as a free migration.

Use copies under ignored `var/reports/`, preserving protected source materials and their lock.
The initial policy paragraph and expectations await owner review. Scripted engineering checks
may characterize draft behavior; they do not establish business correctness, authoring quality,
blind accuracy or savings. Do not call real models during development.

Extend the existing P1 probe with a complete logistics flow and separate process recovery:

- Record the exact baseline/candidate pack and activation choice before starting.
- Submit pending and already-approved NZD 600/800 orders with the original policy.
- Interrupt before or after candidate evaluation; reopen the same agent SQLite stores.
- Compare with an uninterrupted run, attempt the prior approval, finish required human work,
  dispatch and retry; observe duplicate reservations or dispatch events.
- Keep old/new policy outcomes, late decisions and repeated approvals distinct. Retain the
  new-order boundary observations and unchanged-policy controls from the existing probe.

The runner chooses a pack explicitly; it does not implement production policy deployment or
atomic activation across service databases. Business waiting/recovery belongs to SQLite;
P1 contains no investigation and therefore is not evidence of Pi or dynamic planning.

## Effort ledger

Record work even when timing or price is unavailable. Unknown is not zero. Delivery-session elapsed
time is not active human labor. Keep setup, runtime latency, owner review and model use separate.

| Entry | Scope | Evidence | Human active minutes | Delivery/model cost |
|---|---|---|---|---|
| W1-01 | Verify refs/CI, inspect baseline, plan branch and protocol | Planning commit; remote refs and CI read back | Unmeasured | Delivery-agent usage unavailable; runtime model calls: 0 |
| W1-02 | Extend continuity runner, characterize failures and validate | Implementation checkpoint and reproducible manifest; includes failed attempts/repairs | Unmeasured | Delivery-agent usage unavailable; scripted runtime only |

Later authoring comparisons append one entry per attempt: role, task, activation mode, start/end,
active human minutes (or null), prompt/model version, tokens (or null), proposal, review edits and
outcome. Freeze candidate and acceptance criteria before scoring. Match reviewer/tool conditions
for direct-edit and authoring paths. No savings can be calculated from this incomplete ledger.

## Recovery record

Planning checkpoint: `workflow-plan-2026-10-24` / `backup/workflow-plan-2026-10-24`.
The W1 implementation checkpoint and observations will be recorded after validation.
Resolve exact commits with `git rev-parse <tag>^{commit}`.
