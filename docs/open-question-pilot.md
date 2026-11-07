# Open-question development pilot

Three separate delivery-agent conversations assessed draft logistics cases using only their
supplied messages. This explores useful questions and output requirements before adding domain
tools or a rule type. It is not an execution of the POC's Jev, NVIDIA or Pi Durable runtime.
All three cases and their synthetic policies remain draft; owner/independent business review is pending.

## Verify the evidence

Run `pnpm eval:open-question-pilot`. It performs no model or network calls. It checks:

- LF-normalized plan/result file hashes against the committed manifest.
- Each exact task-message hash, reconstructed as `instructions + '\n\n' + JSON.stringify(input, null, 2)`.
  `input` is the case object with `reviewCriteria` removed, preserving property order.
- Exactly three observations, their order/IDs, output fields, citation IDs and permitted action signatures.

[Inputs and prespecified criteria](open-question-pilot.json),
[returned responses](open-question-results.json) and the [manifest](open-question-manifest.json)
are committed together. Prompt hashes were calculated before dispatch. Each prompt was sent with
`fork_turns: none`; no rubric was sent. The recorded task paths identify the three conversations.
Responses are faithfully transcribed JSON content, with whitespace normalized; these are not
signed raw transport receipts. Hashes detect later changes against the manifest, not authorship
or truth. Git review must cover any simultaneous evidence/manifest edit.

The requested no-tool restriction was instructional: subagents retained shared-tool capability.
The returned responses report no executed actions, but this archive has no independently captured
tool-access audit or enforced filesystem sandbox. Shared system instructions still apply to the
agents. Exact model build, token usage, latency, delivery-agent price and human active time were
not exposed/measured. This is a fresh-conversation development pilot, not independently held blind
evaluation or proof of technically enforced context isolation.

Verifier development checks used isolated temporary copies: an edited prompt was rejected by
its hash, and fabricated citation IDs, an unauthorized `dispatch_order` action and a missing
`orderId` argument were rejected structurally even after the temporary result hash was updated.
These checks test the archive verifier; they do not test the business runtime's authorization.

## Provisional delivery review

The same delivery agent authored the fixtures and reviewed these responses. The findings below
are inspectable judgments against the frozen criteria, not independent scores or an accuracy rate.

| Case / criteria | Observed evidence in response | Assessment and limitation |
|---|---|---|
| OQ-01, criteria 1–2 | `facts[3]` identifies declaration/SDS conflict; `decision` maintains hold; final limitation rejects the email's release instruction | Supports conflict detection and restraint on this input |
| OQ-01, criteria 3–4 | First action requests batch-linked formulation, dilution records and applicable SDS; second refers to compliance | Useful draft. Referral currently cites D1–D3 while its prose assumes future documents will be added; an executor must wait and bind their actual IDs |
| OQ-02, criteria 1–2 | `facts[2]` converts 09:15+02:00 to 07:15Z; `facts[0]` leaves logger assignment unverified | Supports time normalization and attribution uncertainty; clock/date accuracy remains unverified |
| OQ-02, criteria 3–4 | `facts[4]` declines a causal conclusion; actions request logger assignment and warehouse evidence; decision retains quality hold | Useful investigation draft. No lookup, document collection or quality decision actually occurred |
| OQ-03, criteria 1–2 | `facts[0]` rejects withdrawn OFF-A; `facts[2]` rejects reuse of OFF-C's old destination checks | Supports distinguishing stale plan evidence |
| OQ-03, criteria 3–5 | First action checks OFF-B for D-2; second is conditional on its outcome; `facts[3]` retains the SDS conclusion; decision requires planner confirmation | Useful draft, not an executable sequence. Conditions are only prose, and the draft skips an explicit validated proposal-submission action before requesting confirmation |

All requested top-level fields were present, citations referenced supplied evidence, and action
names/argument keys matched the described signatures. Those structural checks cannot establish
that a citation supports a claim, that the cheapest policy is correctly interpreted, or that a
conditional action will run at the right time. Three single attempts do not measure reliability,
prompt-injection resistance or advantage over a deterministic controller. OQ-03 supplies an explicit
prior record; it does not demonstrate checkpoint recovery or autonomous invalidation.

## What the source audit establishes

The shared `DurableInvestigator` accepts domain instructions and injected typed tools. That is a
plausible existing execution boundary for these tasks. Current logistics reroute tools cover case
reads, offer search, candidate checking and constrained proposal submission. Document requests,
logger-assignment lookup and quality/compliance referrals in this pilot are proposed interfaces;
they do not exist as executable adapters here. The existing `check_plan` contract is also not
identical to this draft's `(orderId, offerId, destination)` signature.

No new rule kind or runtime change is justified yet. Next implement one bounded evidence-read
and draft-submission exercise using the existing injected-tool boundary, validate its output and
dependencies, then compare with an authored controller on the same facts/tools. Read-only
deterministic tools should normalize timestamps and check offer availability; reserve model
judgment for evidence interpretation and next-step choice. Jev can verify bounded semantic
claims within that workflow. Free-text plans alone must never execute approvals or dispatch.

## Remaining verification before runtime conclusions

1. Have an independent reviewer check the policies, ambiguous wording and response findings.
2. Freeze executable tool schemas, initial evidence, acceptance criteria, comparison arms and
   model settings. Enforce no access to answer keys outside the permitted tool interface.
3. Preserve actual tool calls/results, refusals, model request receipts and output validation;
   test fabricated citations, unavailable tools and conditional branches before execution.
4. Compare uninterrupted execution and process-exit recovery from the same initial context.
   Check repeated model requests, evidence reads, task creation and business side effects.
5. Report all failed attempts and unknown cost fields. Any NVIDIA planning needs separate
   authorization; this pilot consumes zero Jev/NVIDIA requests. Jev usage stays 3/20.

This work is M2 preparation, not a completed milestone. It adds documentation, an offline archive
checker and CI wiring in existing folders; no package, provider, core rule type, protected material
or UI changes. Human effort and delivery-agent costs remain unknown and count as post-baseline work.
