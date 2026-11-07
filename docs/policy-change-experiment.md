# Logistics P1: threshold policy change

Status: scripted characterization of the approved P1 mutation. Shared method and mutation definitions
are in [evaluation-plan.md](evaluation-plan.md). Results use synthetic development fixtures;
authoring/review costs and independent business acceptance remain incomplete.

## Controlled factors

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

## Reproduce and inspect

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

## Rule-level observations

| Observed case | Parameter only | Parameter plus rule version |
|---|---|---|
| New NZD 600 extra cost under the raised threshold | R35 is not applicable; no task | Same |
| Old NZD 600 order pinned to its prior policy | Approval remains required | Same |
| Old NZD 600 pending order re-evaluated | R35 becomes not applicable, but the old task remains open and accepts approval | Old task is cancelled and refuses the late approval |
| Old NZD 800 approved order re-evaluated | Prior approval remains passed | A new approval opens; the old approval is superseded |

The relevant source path is `GraphState.inputsOf` in
[evaluate-rule-graph.ts](../packages/rule-engine/src/evaluate-rule-graph.ts): human-gate
applicability expressions and parameter values are not automatically included in that rule's
input fingerprint. R35 has empty `inputPaths`; its threshold changes eligibility without changing
the fingerprint unless the rule version changes. This explains why simply reloading a parameter
does not reconcile all old tasks.

The original probe chooses packs explicitly and recreates the commercial runtime over an in-memory
store. W1 now also records complete logistics release and process exits before/after propagation,
using the same file-backed agent stores after restart. There is still no production policy router,
atomic cross-service policy rollout or policy-authoring comparison. Runtime timings are local
observations, not human effort or a latency benchmark. Human effort remains unmeasured; runner
preparation and repairs are included qualitatively in the post-baseline ledger. Both variants
preserve the original capability boundary rather than silently repairing the baseline.

Related approval/evidence mutations are documented in [gate-change-experiment.md](gate-change-experiment.md).
