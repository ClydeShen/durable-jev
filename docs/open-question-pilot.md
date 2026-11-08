# Open-question investigation evidence

This document owns the archived message-only pilot and the separate executable document-tool
experiments. The pilot used three fresh delivery-agent conversations; the executable controls use
authored direct/Pi strategies. All inputs are synthetic development material. Business review and
model-driven comparison remain pending; see Evidence boundaries for each result's scope.

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

## Evidence boundaries

| Evidence | Executed by | Establishes |
|---|---|---|
| Three archived OQ responses | Fresh delivery-agent conversations | Inspectable draft findings under instructional context restrictions |
| `evidence-investigation.test.ts` in agent-harness | Scripted Pi in-memory fixture | Synthetic read-before-submit and refusal contract |
| Logistics evidence tools and subprocess controls below | Direct authored controller and scripted Pi SQLite | Current-document binding, idempotent draft recording and bounded process recovery |

The OQ prompts describe proposed document requests, logger lookup and referrals; those operations
are not implemented. Existing reroute `check_plan` also has a different signature from OQ-03.
The separate document-read/draft adapters use the current contract in
[design.md](../.harness/design.md#71-implemented-interface). None of these results establishes
model-selected tool execution, prompt-injection resistance or independent blind accuracy.

## Logistics document adapters and fixed control

The [logistics adapter contract](../.harness/design.md#71-implemented-interface) defines current
case/document binding and draft persistence. This experiment composes those adapters without
adding a browser route.

Run `pnpm eval:evidence-draft` after building. This authored direct-tool control reads LOG-002
from the unchanged materials, uses a separate SQLite database and writes `var/reports/evidence-draft-*/report.json`.
It checks one draft event, duplicate suppression, unchanged shipment and absence of new tasks or
dispatch. The report records evidence, calls/results, source status, implementation/input hashes
and unknown human effort. It does not interpret the documents or score correctness.

The command also runs the same authored request through Pi SQLite in three separate child-process
directories: uninterrupted, exit 137 before submission executes, and exit 137 after the business
write commits but before the tool result returns. Each independent arm has a new conversation and
database; interrupted arms resume their original conversation/request ID. The report requires
one completed read attempt per arm, one submission attempt uninterrupted versus two interrupted,
exactly one draft event, unchanged business state and identical event payloads to the direct arm.
The second cut verifies the business idempotency boundary when Pi retries an uncheckpointed tool.
This uses deliberate process exit, not an OS kill signal or power-loss simulation.

Instructions, task, tool schemas and mechanical acceptance criteria are recorded in the report;
`evidence-draft-control.ts` supplies the shared request construction. Attempt logs and scripted
model-step counts remain in each arm's directory; final Pi answers include observed tool results.
Both controllers are authored algorithms. Their agreement demonstrates this execution/recovery
contract, not equivalent reasoning or any model advantage. Fresh runtime state does not establish
independent blind custody. These checks run on Linux and Windows CI via the same command.

Fifteen tests in `packages/logistics/src/evidence-tools.test.ts` cover the following boundaries:

- Pi refuses empty citations, a missing summary, malformed fingerprint and nonnumeric version
  before invoking the domain executor; error results reach the scripted controller.
- An unregistered dispatch tool is refused without domain execution or a business write.
- Two cases in one database can share document/investigation IDs without sharing draft operations.
  Citations from one case with different document content are refused for the other.
- A model-supplied `caseId` cannot redirect a read away from the trusted conversation scope.
- Current citations, unbumped content replacement, missing/stale scope and persistent duplicate/
  conflicting submissions remain covered, including database reopen.

The subprocess controls above add process-exit recovery evidence. Tools are composed only by
the experiment/tests; the browser demo has no new investigation route. These scripted checks
do not measure model judgment or general prompt-injection resistance. No Jev/NVIDIA requests were used.

## Unverified scope

Independent policy/label review, model-selected investigation, concurrent-change controls and
independent blind custody remain open. The selected schema and two-case checks above do not
establish exhaustive parameter coverage or multi-tenant authentication.
The process controls do not test arbitrary failure timing, OS kill signals or power loss.
Human effort and delivery-agent costs are unknown. Experimental method and live-call rules are
in [evaluation-plan.md](evaluation-plan.md); status and next work are maintained in the
[progress index](workflow-progress.md) and [roadmap](../.harness/roadmap.md).
