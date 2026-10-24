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

## W1 mutation specification (owner-approved, 2026-10-24)

P1 changes R35's additional transportation cost approval threshold from NZD 500 to NZD 750.
Only amounts strictly above the threshold need a commercial manager's approval. New orders use
the candidate pack. Existing unshipped orders either retain their original pack or explicitly
re-evaluate using the candidate pack; run and record both owner-selected activation modes.

Keep the parameter-only variant to expose the baseline's stale-task behavior. Compare it with
the existing rule-version discipline: change the threshold and increment R35's version. Under
that discipline, an NZD 800 previously approved order may need reapproval even though it exceeds
both limits. Report that additional work rather than hiding it as a free migration.

Use copies under ignored `var/reports/`, preserving protected source materials and their lock.
The owner approved the threshold, strict comparison and both activation modes on 2026-10-24.
The wider LOG-005 case labels remain draft. Engineering checks establish continuity and the
approved threshold boundary; they do not establish authoring quality, blind accuracy or savings.
Do not call real models during development. R35's original policy paragraph names the threshold
parameter rather than a literal amount, so the copied paragraph needs no wording change for P1.

The existing P1 command now includes a complete logistics flow and separate process recovery:

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

## W1 evidence and source walkthrough

Run `pnpm check`, then `pnpm eval:policy-change`. Each unique `var/reports/policy-change-*`
directory retains the copied packs, plan/input hashes, agent SQLite databases, process logs,
state snapshots and JSON/Markdown report. Both CI platforms run it. The report includes the
source commit/dirty status and relevant executable hashes; reproduce from the checkpoint for
a clean source reference. Absolute run paths are local artifact locations, not portable URLs.

There are 44 rule-level observations (22 per variant), including 24 new-order boundary checks.
Sixteen full-flow scenarios cover two variants, two activation modes, two amounts and two initial
approval states. Each has an uninterrupted control plus exits with code 137 before and after
policy propagation: 48 completed flows, including 32 process resumptions. Compare full outcome
status/fingerprint and task-identity/status snapshots, not just the final release boolean.

| Observation | Meaning for the technical CEO | Meaning for the non-technical CEO |
|---|---|---|
| Retaining the old pack preserves pending/completed approval behavior | The same engine/runtime can execute an explicitly selected historical pack | Existing work can continue under the old threshold |
| Parameter-only re-evaluation leaves an NZD 600 pending approval usable | Applicability parameters do not automatically change this human gate's fingerprint | A policy rollout needs more than editing a number |
| Versioned re-evaluation refuses the old task and reopens approval at NZD 800 | Existing version-based task invalidation works; shared engine is unchanged | Extra review work must be included in the change cost |
| Resumed flows match controls, with one booking and one dispatch event each | SQLite owns business recovery; replay-safe side effects survive these process exits | Completed work survives these interruptions without duplicate booking/dispatch |

Recovery checks and threshold checks fail the command on regression. Known parameter-only
stale-task behavior remains a reported finding, not a hidden test waiver or a successful migration
claim. This is local-agent assembly, not a new native/A2A transport benchmark. Interruptions are
at propagation boundaries; partial cross-service rollout and arbitrary failure timing are untested.

The source change is four small runner files in the existing `eval/runner/src/`: workflow assembly,
process entry, comparison runner and evidence hashing. The existing P1 command composes them.
The only business-package change is `LocalLogisticsAgents.close()`, which releases all five
SQLite handles between control phases. No rule engine, runtime contract, schema, dependency,
protected material, UI or package hierarchy changed. CI and knip register the new executable path.

Implementation repair record: one inferred declaration exposed a private logistics type; an
explicit workflow result type fixed the typecheck. One local command used the host Node version
after a failed search and was rerun with the pinned PATH. Neither was counted as a runtime finding.
These iterations and runner preparation remain post-baseline effort; human time is unmeasured.

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

Planning checkpoint: `workflow-plan-2026-10-24` / `backup/workflow-plan-2026-10-24` at `31ae95b`.
W1 checkpoint: `workflow-policy-continuity-2026-10-24` /
`backup/workflow-policy-continuity-2026-10-24`.
Resolve exact commits with `git rev-parse <tag>^{commit}`.

W1 completes the first engineering continuity slice, not all T8.5 experiments: reviewed authoring,
P2/P3, independent blind evaluation and effort comparisons remain open. W2 is next: a bounded
investigation/control experiment with explicit tool-choice evidence and Pi/domain state ownership.
