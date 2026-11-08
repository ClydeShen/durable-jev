# Post-baseline progress and effort

All work here is measured after the frozen [baseline](baseline.md). Branch and archive identities
are maintained in [branch-strategy.md](branch-strategy.md); task-level acceptance is in
[the roadmap](../.harness/roadmap.md). This file owns current milestone status and the effort ledger.

## Milestone status

| Milestone | Status | Remaining acceptance work |
|---|---|---|
| M1 logistics policy contract | In progress | Review policy/engine boundary, existing-order behavior and known invalidation limits |
| M2 configurable durable agents | In progress | Model substitution, A2A configuration/task semantics and bounded robustness evidence |
| M3 independent validation | Not started | Independent custody, frozen candidate/labels and bounded failure evaluation |
| M4 insurance policy replacement | Not started | Bounded reviewed policy, shared-path execution and complete migration diff/limits |

No milestone has been accepted for archiving. Optional cross-domain A2A follows M4.
Code-effort and authoring-cost comparisons are secondary measurements under spec section 9;
their incomplete records do not alone block primary capability acceptance.

## Evidence index

| Evidence | Owner | Boundary |
|---|---|---|
| P1 threshold changes and order continuity | [policy-change-experiment.md](policy-change-experiment.md) | Scripted policy/recovery characterization |
| P2/P3 approval/evidence changes | [gate-change-experiment.md](gate-change-experiment.md) | Scripted migration and synthetic authoring rehearsals |
| Offer investigation strategies | [investigation-experiment.md](investigation-experiment.md) | Authored strategies, Pi memory/SQLite recovery controls |
| Selected real semantic judgments | [jev-probe.md](jev-probe.md) | Bounded development probes; no blind accuracy or authoring-cost conclusion |
| Open-question drafts and document tools | [open-question-pilot.md](open-question-pilot.md) | Delivery-agent drafts plus separate scripted tool/process-recovery evidence |

Technical review follows the source contracts, full post-baseline diff and state ownership in
these reports. Business review follows policy effects, repeated work, manual intervention and
measured effort. The reports state where evidence is scripted, live, draft or independently reviewed.

## Effort ledger

Record work even when timing or price is unavailable. Unknown is not zero. Delivery-session elapsed
time is not active human labor. Keep setup, runtime latency, owner review and model use separate.

| Entry | Scope | Evidence | Human active minutes | Delivery/model cost |
|---|---|---|---|---|
| W1-01 | Verify refs/CI, inspect baseline, plan branch and protocol | Planning commit; remote refs and CI read back | Unmeasured | Delivery-agent usage unavailable; runtime model calls: 0 |
| W1-02 | Extend continuity runner, characterize failures and validate | Implementation checkpoint and reproducible manifest; includes failed attempts/repairs | Unmeasured | Delivery-agent usage unavailable; scripted runtime only |
| W2-01 | Offer variants, strategy control, checkpoint comparison, evidence and synchronized presenter script | Investigation checkpoint; 32 runs, including eight observed memory recovery failures | Unmeasured | Delivery-agent usage unavailable; runtime model calls: 0 |
| W1-03 | P2/P3 gate migration, isolated authoring CLI, validation/application rehearsal, repairs and presenter script | Gate-change checkpoint; 24 observations and two synthetic authoring rehearsals | Unmeasured | Delivery-agent usage unavailable; live model calls: 0; faux token reports are not billing |
| W1-04 | Owner-approved readability cleanup of P2/P3 and authoring orchestration | Same 24 observations and Markdown report as d520c01; explicit cases, mutation mapping and separate probes; no behavior/core change | Unmeasured | Delivery-agent usage unavailable; live model calls: 0 |
| W1-05 | Persist request allowance, freeze selected inputs and substitute real semantic answers into scripted controls | Three HTTP 200 Jev responses; same business branches; raw inputs/hashes/results in jev-probe-evidence.json; docs and presenter script synchronized | Unmeasured | 3 real Jev requests, 1,101 input / 120 output tokens; price and delivery-agent usage unknown; no NVIDIA |
| M2-prep-01 | Freeze three open-question cases, clean-context requirement, delivery-agent trials, provisional review and offline integrity checker | open-question-pilot.md and hashed input/result artifacts; conditional-action and provenance gaps retained | Unmeasured | 3 fresh delivery-agent trials; their tokens/price unknown; Jev/NVIDIA requests: 0 |
| M2-prep-02 | Exercise evidence-read and validated draft submission through existing Pi tool execution | Five integration checks with test-local adapters; no core or production domain changes; persistence and model decisions untested | Unmeasured | Delivery-agent usage unknown; runtime Jev/NVIDIA requests: 0 |
| M2-prep-03 | Add bounded logistics document-read/draft tools and an isolated authored control | Eight focused checks: Pi integration, current citations/content, scoped access and persistent duplicate/conflict handling; report command eval:evidence-draft | Unmeasured | Delivery-agent usage unknown; runtime Jev/NVIDIA requests: 0 |
| M2-prep-04 | Compare direct/Pi authored controls and resume two real process exits | Before-submit and after-write cuts: completed reads reused, retried submissions deduplicated, one identical review draft; instructions/schemas/attempts recorded | Unmeasured | Delivery-agent usage unknown; runtime Jev/NVIDIA requests: 0; scripted model steps are not billing |
| M2-prep-05 | Define fair reroute comparison and offline preparation manifest | Four existing offer conditions; first-valid primary baseline; input/source/plan hashes checked; model arm and review pending | Unmeasured | Delivery-agent usage unknown; runtime Jev/NVIDIA requests: 0 |
| M2-prep-06 | Verify selected Pi argument refusals and two-case evidence isolation | Malformed calls and unknown dispatch never execute; case arguments cannot redirect reads; colliding IDs preserve separate drafts | Unmeasured | Delivery-agent usage unknown; runtime Jev/NVIDIA requests: 0 |
| M2-contract-01 | Repair trusted draft metadata and refused-call audit coverage | Schema/storage regressions plus structured rejection callbacks and F09 outbox assertion | Unmeasured | Delivery-agent usage unknown; runtime model requests: 0 |
| M2-contract-02 | Verify provider substitution at the rule-evaluation boundary | Same fresh graph/facts for scripted and fake-transport Jev; shared guard rejects out-of-range and incompatible judgements; application configuration pending | Unmeasured | Delivery-agent usage unknown; real model requests: 0 |
| DOC-01 | Consolidate ownership, lifecycle, current handoff and experiment references | Historical studies archived; inventory/link gate added; frozen evidence unchanged | Unmeasured | Delivery-agent usage unknown; runtime model requests: 0 |

Later authoring comparisons append one entry per attempt: role, task, activation mode, start/end,
active human minutes (or null), prompt/model version, tokens (or null), proposal, review edits and
outcome. Freeze candidate and acceptance criteria before scoring. Match reviewer/tool conditions
for direct-edit and authoring paths. No savings can be calculated from this incomplete ledger.
