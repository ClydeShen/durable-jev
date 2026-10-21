# Report: what the evidence says so far

Status on 2026-10-21. Two of the five hypotheses are only half tested because the generative-model comparisons need an NVIDIA key that has not been provided. Each row says what was measured, what it supports and what it does not. All of it comes from synthetic cases whose expected results are still drafts; read the numbers as "this mechanism works on this set", not as production rates.

## Hypotheses

| | Hypothesis | Evidence | Verdict |
|---|---|---|---|
| H1 | Jev can do the limited semantic judgements at acceptable quality and cost | Four live runs of the eight cases, then 54 readings scored against the draft labels ([live-checks.md](live-checks.md)). Median call 140 ms; about 440 input tokens per question, which at the listed input price is a fraction of a cent for the whole set (no invoice checked). Readings near the 0.8 and 0.2 lines flip between runs; a 0.05 review band removed every unstable question and every wrong automatic answer, at the price of 22% of readings moving from automatic to a person (89% to 67% automatic) | Partly supported. The comparison with a generative model's structured output (B1) is not done, so "better than the alternative" is open |
| H2 | A dynamic agent suits investigations whose path varies | The investigation agent works end to end (read-only tools, a fit check, proposals that need acceptance), but only with a scripted model. No fixed-workflow comparison (B2) | Not tested |
| H3 | Pi Durable lowers the cost of agent recovery | Same loop and tools killed at four points, five trials each ([benchmarks.md](benchmarks.md)): both runtimes recover every time; Pi repeats only the call that was cut off, the in-memory loop repeats everything done so far (1 to 5 attempts). Pi 1.3.0 has no restart limit and cannot express "human only"; this project added both outside Pi. Resuming after a write-then-crash needs the business-side operation id either way (F02) | Partly supported for saved work. Benefit with a real model (tokens, divergent paths) is not measured |
| H4 | A2A can unify the interface of different service implementations | The coordinator switches between native HTTP and A2A by configuration with no change to its logic, and 201 of 201 calls return identical results. A2A adds about 2 ms per call at p50 on one machine. The SDK does not deduplicate resent messages; the project's task-link table does (F04) | Supported for interface replacement. Overhead measured only on loopback; a second, differently implemented service was not built |
| H5 | The layered design keeps business traceability | Every event carries case, revision and rule version; human tasks and agent proposals are bound to a revision and fingerprint; a Console reads one order's timeline, calls, model judgements and recoveries; 19 fault scenarios check what is voided, refused or recovered | Supported for what the demo covers. "Evidence validity" (citations that exist and are current) was not measured as a rate |

## What is solid

- The separation works: rules decide, the model answers narrow questions, people approve, agents propose. Nothing in the agent's toolset can approve, change the plan or dispatch, and an injected instruction in a document did not change a decision.
- Failure behaviour: a model outage gives a technical failure and never a pass; duplicate and stale requests are refused; a crash loses nothing; two concurrent plan changes cannot both apply. These are checked by `pnpm faults` (19 of 19) and the Proof page.
- Human gates are bound to versions: a plan change voids exactly the approvals that depended on what changed.

## What is not shown

- Accuracy on real data. 18 labelled questions, three runs each; labels are the draft reviewer's own.
- B1 and B2 against a generative model, and any real-model recovery test for B3.
- Scale, concurrency and a second implementation of a branch service.
- Whether the review band's cost (a fifth of readings to a person) is acceptable; that depends on what a person's time costs, which this project does not know.

## Recommendations on components

| Component | Recommendation | Why |
|---|---|---|
| Jev for semantic questions | Use it for narrow, labelled questions, with a review band around every threshold and a person for anything near a line; keep documents in the data channel only | Readings drift across the lines between runs; injected text moved one score (0.21 to 0.38) without changing a decision |
| Generative agent for investigation | Keep it read-only and proposal-only; do not widen its tools | The controls (tool allowlist, budgets, revision binding) carry the safety, not the model |
| Pi Durable | Worth adopting where the model call is expensive or the path varies; keep the project's own restart limit and business-side idempotency | Saves repeated work; does not replace idempotent writes |
| A2A | Use it when services come from different teams; native HTTP is fine inside one team | Small overhead; the real cost is the extra layer and task-link bookkeeping |
| Observability | Keep the per-service outbox and the Console | It is what made the live findings visible (and found a bug in the Console itself) |

## To close the open items

1. An NVIDIA key, for B1 (structured-output judge against Jev on the same labelled questions) and for a generative investigator (B2, B3 with a real model).
2. Historical cases with independent labels from two reviewers, to turn the draft numbers into real ones.
3. Reviewer sign-off on LOG-001 to LOG-008.
