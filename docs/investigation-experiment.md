# W2: investigation strategies and checkpoint continuity

This is a scripted engineering experiment on `feat/durable-policy-workflow`, after W1 checkpoint
`workflow-policy-continuity-2026-10-24` (`160dc02`). It adds no production runtime, domain package
or UI. The full post-baseline diff still starts at `baseline-2026-10-24-r2`.

## Question and controlled factors

Can the existing investigation flow take different paths as tool evidence changes, preserve its
completed work across interruption, and leave plan changes under human authority?

- **Strategy:** existing authored first-valid controller versus an authored check-all controller.
  Both inspect offers in price order and propose the cheapest qualifying one, or escalate.
  Check-all deliberately inspects every candidate; an ordinary deterministic workflow could also
  stop early. A lower tool count is not evidence that an LLM is better than deterministic code.
- **Inputs:** the original three LOG-004 offers; the valid offer repriced to NZD 3,500 so it is
  first; the valid offer removed; all offers removed. These are synthetic fixture variants,
  applied to an in-memory reference-data copy. Protected materials remain unchanged.
- **Persistence:** Pi MemoryStorage versus Pi SQLite. Business stores remain file-backed SQLite
  in both arms. This isolates checkpoint persistence, not Pi versus another durable framework.
- **Interruption:** uninterrupted control versus process exit 137 after the two completed reads,
  before the first check or submission executes. Restart uses the same business stores and the
  same Pi file, when present. The interrupted call's attempt is logged before exit.

Four input variants × two strategies × two storage modes × two execution modes = 32 runs.
The eight interrupted memory runs are expected recovery failures and reported as `CHECKPOINT_LOST`.
An expected-loss assertion passing must not be reported as a recovered investigation.

## Reproduce and inspect

Run `pnpm check`, then `pnpm eval:investigation`. It refuses `MODEL_MODE=live`. Linux and Windows
CI run the command. The printed path points to a unique `var/reports/investigation-*` directory:

- `materials/` snapshots the original inputs. Child processes verify hashes against the actual
  read-only materials before executing. Scenario transformations are recorded in each plan.
- Each run keeps `plan.json`, original case data, process logs, interruption marker, business/Pi
  databases and `result.json`. The memory arm intentionally has no persisted Pi conversation.
- `report.json` records source commit/dirty status, relevant executable hashes, input hashes,
  complete tool results, call attempts, business decisions and individual execution/resume times.
- `report.md` is the presenter-facing comparison. Timings include process startup and are single
  observations, not latency benchmarks, human labor or model cost measurements.

Assertions check selected offers/escalations, expected completed-check counts, unchanged orders
before confirmation, wrong-role refusal, one accepted planner confirmation producing revision 2,
duplicate-confirmation refusal and no automatic dispatch. Completed tool results and business
decisions must match the uninterrupted memory control for the same input and strategy.

The two completed reads must each run once even after durable recovery. Attempt logs may include
the unfinished check/submit twice; the transcript records completed tool results separately.
Proposal and confirmation event counts detect duplicate domain writes in the tested flow.

## Observed behavior

| Condition | First-valid | Check-all | Business outcome |
|---|---|---|---|
| Original offers; only the third passes | 3 completed checks | 3 completed checks | Same OFF-FROST-0630 proposal |
| Valid offer is cheapest | 1 completed check | 3 completed checks | Same OFF-FROST-0630 proposal |
| No valid offer | 2 completed checks | 2 completed checks | Escalation; no order change |
| No offers | 0 completed checks | 0 completed checks | Escalation; no invented replacement |

Uninterrupted memory/durable runs complete under both strategies. All eight durable resumptions
match their controls, without repeating completed reads. All eight memory resumptions lose the
conversation while retaining a RUNNING business investigation; they need explicit repair and do
not silently fabricate a proposal. This failure is recorded, not automatically repaired by W2.

For proposed plans, a warehouse operator is refused. A planner can confirm once; applying the
confirmed patch produces revision 2 and normal rule propagation. The investigation itself never
changes or dispatches an order. Invalid/no-offer cases remain at revision 1.

## CEO interpretation and limits

For the technical CEO, walk through three runner files in the existing `eval/runner/src/` and the
shared `experiment-evidence.ts` helper, then the unchanged `RerouteDesk`, domain tools and generic
`DurableInvestigator`. No engine or runtime change was needed for these experiment conditions.
Source/material/model provenance and the complete post-baseline diff are part of the evidence.

For the non-technical CEO: the same execution path can inspect alternatives, explain why no plan
works, preserve completed investigation steps and wait for the authorized person. The memory
control makes the recovery contribution visible. Actual development savings remain unmeasured.

Both decision policies are hand-written. This is not live-model planning, B2 quality/effort scoring,
independent blind evaluation or an enterprise savings estimate. Jev answers and the input cases
remain scripted/draft. Failure timing is one boundary, not arbitrary crash coverage. The existing
tool-budget reset and uncapped-restart limits remain. Native/A2A transport comparison is separate.

Next finish the reviewed logistics mutation/authoring evidence and prepare the live investigation
comparison before insurance (T8.5 → T8.6). A live comparison needs a reviewed task set, bounded
model budget and explicit live-run authorization; independent blind custody is still unavailable.

## Effort and recovery

All fixture preparation, the controller adapter, process/evidence runner, regression work and demo
script corrections are post-baseline effort. Human active time and delivery-agent tokens/cost are
unmeasured; runtime model calls are zero. No labor-saving estimate is calculated.
The first quality run required regenerating the architecture diagram after helper extraction;
its dependency edges were unchanged, only their generated order changed. This preparation and
the following regression run remain part of post-baseline work.

Recovery tag: `workflow-investigation-controls-2026-10-24`; backup branch:
`backup/workflow-investigation-controls-2026-10-24`. Resolve the commit via the annotated tag.
The archive includes code, evidence descriptions and the synchronized Chinese presenter script;
generated databases/reports are local, reproducible artifacts. Earlier recovery refs remain fixed.
