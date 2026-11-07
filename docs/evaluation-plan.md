# Evaluation plan: durable-agent capabilities and development cost

Status: experiment design and source audit, not a performance or cost result. The owner-approved
experimental code/material baseline is frozen at `baseline-2026-10-24`; the current recovery
`baseline-2026-10-24-r2` adds aligned documentation only. See [baseline.md](baseline.md).
Evaluate logistics policy changes before motor insurance adaptation. There is
no nominated incumbent engine; large real-world rule estates motivate the question, not a
specific product comparison.

This is a capability-exploration POC, not a product delivery. The central hypothesis is that
durable agents can reduce the effort of building and changing rule-driven workflows. Explore
feasibility, suitability and limits; do not require a fully decoupled engine before measuring.
Current coupling and synthetic materials bound the conclusions rather than invalidate the research.

## Clean-context experimental agents (owner requirement)

Start each independent trial in a fresh agent conversation and isolated run state. Supply only
the frozen task instructions, policy, case inputs and allowed tool descriptions/results. Exclude
delivery-chat history, design discussions, expected answers, scoring labels, prior solutions and
other trials' transcripts. Agent and comparison arms receive the same permitted initial evidence.
If a delivery subagent executes a trial, use no inherited conversation (`fork_turns: none`) and
explicitly scope its accessible inputs; the flag alone does not isolate the shared filesystem.

Keep answer keys and reviewer notes outside the tested agent's accessible workspace/tools. Record
the initial prompt, input hashes, model/settings, tool access and subsequent transcript. Declare
any context contamination and exclude that attempt from clean-context scoring, while retaining
its cost and outcome record. Developer-authored cases remain development cases even in a fresh
conversation; clean context is not independent blind custody.

For recovery comparisons, each control/recovery arm starts from the same clean initial context.
After interruption, the durable arm resumes its own persisted checkpoint rather than starting a
new conversation. Keep the deliberately memory-losing control distinct. Cross-trial context is
excluded; within-trial checkpoint continuity is the capability being tested.

## Measurement boundary

The runnable checkpoint `demo-checkpoint-2026-10-24` (`0265a05`) is a recovery point, not the
experimental baseline. The owner explicitly excludes the agreed pre-baseline cleanup from later
policy-change and cross-domain migration costs. Document that preparation separately; do not
present subsequent results as the total cost of creating the engine from scratch.

The frozen baseline records its accepted commit, material hashes and environment in
`docs/baseline-manifest.json`. Count all further adaptation, preparation, review and failed attempts
required by each measured experiment. Do not move the baseline retrospectively to exclude costs.
The documentation revision changes no implementation, materials or engineering configuration and
does not reset that cost boundary. Continue on the active branch defined in [branch-strategy.md](branch-strategy.md).
Historical pre-cleanup probes remain distinct from post-baseline characterization and blind results.
The post-baseline characterization and full-flow recovery protocol are recorded in
[policy-change-experiment.md](policy-change-experiment.md).

## Questions the evidence must answer

1. When policy changes, which changes require only rule data and which require application or
   shared-engine code?
2. What does a reviewed, correct change cost from interpreting the policy to accepting the
   updated system, including failed generation attempts and regression work?
3. Which workflow decisions can agents make, which remain authored logic, and when is human
   intervention needed?
4. What does durable execution contribute beyond declarative rules alone?

## Capability map

| Capability | Evidence sought | Limits to record |
|---|---|---|
| Rule authoring | Policy interpretation, validated proposals and reviewed changes | Incorrect or unsupported rules, repair effort and business questions |
| Agentic investigation | Tool choice and changed paths when evidence or constraints change | Fixed scripted paths, invalid calls, exhausted budgets and manual fallback |
| Collaboration | Useful handoffs, parallel progress and human gates | Hard-coded coordination, role mistakes and unresolved dependencies |
| Durable continuity | Waiting and restart recovery without repeated side effects | Lost context, duplicate work and recovery effort |
| Policy adaptation | Both old-policy retention and new-policy re-evaluation | Required data, prompt, tool or code changes and stale decisions |

For each capability, report demonstrated behavior, conditions, development effort and observed
failure modes. A failed experiment is evidence, not automatically a request to build a product feature.

Rule count and the proportion of rules using a code evaluator do not answer these questions.
In particular, one code evaluator among 150 definitions is not a measurement of human effort,
live authoring success, total implementation cost or production readiness.

## Baseline and source audit

[baseline.md](baseline.md) owns the accepted structure and remaining coupling. Its manifest
records the frozen source/material boundary. The pre-cleanup audit remains in Git history;
it is not a current implementation description.

`pnpm eval:portability` records schema compatibility probes and LF-normalized source hashes in
`var/reports/portability-baseline.json`. A report describes its hashed working tree, not an assumed
clean commit. Schema acceptance alone does not establish business execution or domain migration.
Record additional adaptation after freeze in the effort ledger.

## First experiment: logistics policy changes

P1-P3 below are owner-approved synthetic mutations; P4-P5 remain proposals. Approval of mutation
semantics is not independent review of the surrounding case labels.
Use isolated candidate packs; leave `eval/materials/` and its lock untouched. Review each revised
policy paragraph and its expected business behavior before generation or acceptance scoring.

| ID | Policy change | What it tests | Required observations |
|---|---|---|---|
| P1 | R35 extra-cost approval threshold: NZD 500 to NZD 750 (`extraCostApprovalThresholdCents`: 50,000 to 75,000) | Parameter-only change | Boundary values below, equal to and above both limits; changes to the gate and release decision |
| P2 | R13: require the second quality sign-off for every controlled shipment, instead of only controlled cold-chain shipments | Approval-chain change | New second step, role enforcement, distinct actors, pending and completed chains |
| P3 | R21 repacking: additionally require `inspectionReportRef` as evidence | Human operation evidence change | Missing evidence refused; complete evidence accepted; treatment of already-open/completed tasks |
| P4 | A customer handover clause changes its allowed modes while retaining its customer scope | Applicability and expression change | Affected customer, other customers and mixed rule dependencies; no unrelated outcome changes |
| P5 | A revised packaging/document clause changes one semantic question | Semantic authoring and runtime quality | Expert-reviewed meaning, uncertain cases, held-out paraphrases, model failures and abstentions |

For every mutation, retain an unchanged-control pack and cases that must remain unaffected.
P1-P3 can establish the initial deterministic pipeline. Specify P4-P5's exact policy wording
with the owner before creating their acceptance cases.

Separate two experiment cases: new orders using the new policy, and orders already waiting for
approval or with completed evidence. The owner selected both modes for evaluation: old orders
remain on their prior policy, and unshipped old orders are re-evaluated under the new policy.
Measure each separately, including which tasks are reissued. Do not infer that fingerprints alone
provide a complete policy deployment and rollback mechanism. Policy change is also different from the existing
demo's shipment-data revision.

Before measuring, freeze the starting commit, rule pack, model/prompt versions, generation
budget and business acceptance criteria. Run P1-P3 independently from the same baseline, then
measure a separately identified cumulative sequence; do not mix those costs.

### Existing logistics evidence

[P1 protocol and observations](policy-change-experiment.md),
[P2/P3 protocol and observations](gate-change-experiment.md) and the
[effort ledger](workflow-progress.md#effort-ledger) own experimental results and cost records.
These are development characterizations; independent authoring/review and blind evidence remain open.

## Second domain: motor insurance claims

The owner selected insurance, specifically motor insurance rules and claims policies, for the
cross-domain experiment. Start after the logistics policy-change experiment; do not build an
insurance product or attempt comprehensive coverage of the industry.

### Minimal extension shape and source walkthrough

The intended common unit is a domain agent: domain-owned policy/rules, validated business facts,
tools and special evaluators, running through shared rule evaluation, durable execution and A2A
contracts. Each industry can supply several agents with different responsibilities. A2A supplies
task interoperability, not a universal business-data schema.

Necessary extraction of logistics coupling belongs to the agreed pre-baseline cleanup, outside
later experiment costs. Further changes needed after freeze are counted. Start with the existing packages and two concrete domain shapes;
do not build a general-purpose extension platform. Preserve domain-specific validation.

Target one added domain material pack (policy, rules, cases and reviewed expectations), plus
only the insurance-specific fact shapes, evaluators or tools that cannot be expressed correctly
through existing mechanisms. Reuse the existing runtime and console rather than creating a
parallel insurance stack. Colocate related domain code; do not multiply packages or invent a
plugin framework in anticipation of future domains.

Make only the shared-boundary changes the two concrete domains require. Keep domain concepts
out of shared execution logic, without forcing special business logic into opaque configuration.
Preserve the logistics behavior and evaluate both domains through the same execution mechanisms.

For the technical CEO, present the full migration diff grouped as materials, domain-specific
logic, wiring and shared-code changes relative to the frozen baseline. Document pre-baseline
extraction separately; include any additional extraction after freeze in the experiment ledger.
The desired demonstration is that
changing domain or policy needs a small, understandable change; if the experiment requires more,
show that limitation instead of hiding it. This does not require a new application feature.

### Adaptation boundary

The frozen baseline already supplies domain-owned vocabulary, facts and validation through shared
case/runtime/transport contracts. Use [baseline.md](baseline.md) for its accepted structure and
[design.md](../.harness/design.md) for current interfaces. The insurance experiment must measure
remaining domain adapters, application wiring, legacy DTO assumptions and any further shared-code
changes. Pi checkpoints investigation; business transactions retain side-effect ownership.

### Proposed scenarios

Use a small synthetic policy pack with explicit contract wording and reviewed expectations.
The following are proposed scenarios, not agreed coverage terms or legal interpretations:

| Scenario | Capability to examine |
|---|---|
| Policy period, insured vehicle and covered driver | Structured eligibility and missing facts |
| Excess, repair estimate and coverage limits | Deterministic amount calculations and boundary cases |
| Incident narrative and a stated exclusion | Semantic judgment, conflicting evidence and uncertainty |
| Missing repair estimate or incident evidence | Agent-selected evidence requests, waiting and resumption |
| Assessment referral and high-value approval | Role-specific handoffs and human decisions |
| Revised excess or evidence requirement | Policy adaptation cost and changes to pending work |

Keep policy, claim, incident, vehicle and assessment concepts explicit; do not disguise them as
shipments. Record what transfers unchanged, what needs new rule data/prompts/tools, and what
requires shared-code changes. Include preparation and review effort in the measured cost.
Distinguish reusable declarative evaluation from the agent's actual workflow decisions and
durable recovery contribution.

Before creating scored cases, agree a bounded policy wording, currency, calculation order and
decision outcomes. Identify the governing policy version using the synthetic contract's explicit
terms; do not assume that logistics' old-order activation modes legally apply to existing claims.
Use fabricated data only. Real insurer accuracy, regulatory compliance and automated claim
settlement are outside this experiment's claims.

## Comparisons and cost accounting

Use two implementation paths initially:

- **Reviewed direct edit:** a delivery agent/engineer changes the rule data against the approved
  policy, then an independent business reviewer and the same acceptance suite assess it.
- **Authoring proposal:** the authoring agent generates rule data from that policy, then an
  independent business reviewer and the same acceptance suite assess it.

Both paths may use the same delivery tools, documentation and public development examples.
Neither receives hidden answers or extra business information. Record authoring-model use
separately from delivery-agent use. Counterbalance task order or use fresh sessions so the
second path does not inherit the first solution. Report repeated runs and failed attempts.

These compare ways of changing this system, not this system against an unspecified legacy engine.
If a code-based reference implementation is later needed, agree its boundary first, include its
construction cost, and identify it as synthetic. Rewriting, wrapping and incrementally adapting
an actual incumbent require its own assessment once a real project supplies one.

| Cost bucket | Evidence to record |
|---|---|
| Experiment preparation | Fixture creation, baseline setup and any schema/runtime/tool changes required by the experiment |
| Policy interpretation and authoring | Active person-minutes by role, questions to the policy owner, generated proposal and failed attempts |
| Review and repair | Reviewer time, rejected/changed definitions, repair time and final accepted diff |
| Automated execution | Wall time, model input/output tokens, retries, errors and price source/date |
| Validation and continuity | Regression work, handling in-flight tasks, restart recovery and manual intervention |

Real-project integration costs are outside the current measurements. Identify relevant unknowns
when discussing transferability, without turning them into a production implementation backlog.

Keep active human time, model latency and calendar lead time separate. Do not infer human effort
from commit timestamps or treat an unreported model price as zero. Report tokens without a money
estimate until a reliable price is available. AI-assisted coding effort belongs in both paths.

For a stated scenario, compare initial adaptation cost plus the observed cost of subsequent
changes. Derive any break-even point from those measurements and explicitly supplied change
frequency and labor rates. Report rule families and change complexity, not only cost per rule;
scaling 150 definitions to thousands by a constant factor is not evidence of linear cost.

## Blind evaluation and acceptance

- The current 8 demo cases and 26 screening samples are development data, never blind data.
- Have a business reviewer approve labels and ambiguous cases. Draft expectations are not ground
  truth. A second agent in this shared workspace is not an independent blind-test custodian.
- Freeze the candidate code, rules, questions and thresholds before hidden evaluation. The
  implementer must not see hidden labels, individual failures or run summaries during tuning.
- A separate custodian supplies held-out cases and keeps answers outside the implementer's
  accessible workspace. The evaluator receives candidate outputs after freeze and returns a
  report. If independent custody is unavailable, call it a held-out regression run, not a blind test.
- Include boundary, missing-data, contradictory-text, role, four-eyes, expiry, stale-decision,
  in-flight-policy-change and unchanged-control cases. Agree sample counts and failure limits
  before looking at results; report by rule family and final decision.
- Report wrong releases separately from false blocks, escalations, technical errors, automatic
  coverage and selection misses. Escalating every case must not earn a false accuracy claim.
- Publish the denominator and uncertainty. Zero wrong releases in a finite sample does not prove
  production safety. Repeating the same cases is not additional independent sample size.
- After unblinding, a fix and re-run are a disclosed regression cycle; a new blind claim needs
  new independently held cases.

## Durable execution comparison

Keep the same policy, evaluators, model inputs and tools; vary persistence/recovery only. Measure
recovery success, repeated side effects, manual repair time and implementation effort for waiting
and restart handling. Include a restart during a policy transition. Model stochasticity and
business-rule changes are separate factors.

The current faults demonstrate recovery behavior but do not yet price the implementation saved
against another recovery approach. Declarative policy adaptation explains rule reuse; durable
execution explains continuity of long-running work. Report the two benefits separately.

W2's [investigation controls](investigation-experiment.md) add 32 scripted runs with the same
domain tools/rules and two authored decision policies. They isolate Pi MemoryStorage/SQLite
under a process interruption after completed reads. The memory arm loses its conversation;
the durable arm resumes. Both use Pi, so this is not Pi versus a non-Pi framework or a priced
development comparison. The first-valid/check-all difference is deterministic strategy behavior,
not evidence of an LLM advantage. T7.2's reviewed live comparison and independent custody remain open.

## Live request procedure

[Spec section 17](../.harness/spec.md#17-bounded-live-jev-authorization-2026-10-24) owns live Jev
authorization and per-step/total ceilings. `.harness/jev-allowance.jsonl` owns consumed reservations.
[jev-probe.md](jev-probe.md) documents the guarded entrypoint and frozen probe evidence.

Before HTTP, reserve and fsync the request under an exclusive lock. Failed/timed-out attempts and
retries retain their reservation. Use one authoritative checkout; do not restore an older journal
to refund requests. The entrypoint guard is not a provider-wide quota. Freeze selected inputs and
criteria, disable automatic retries/redirects, and retain partial outcomes. Do not invoke unrestricted
live replay or model checks under this bounded allowance. NVIDIA generation/planning requires
separate authorization.

## Deliverables and decision boundary

1. A source-hashed coupling baseline and reviewed logistics mutation specifications.
2. An experiment manifest, timing/token ledger, immutable proposals and reviewed acceptance data.
3. Per-mutation reports for direct edit versus authoring, plus unchanged-control regressions.
4. An independently held evaluation report and a capability map including failures and human fallback.
5. A CEO-facing summary separating demonstrated capabilities, observed development/change cost,
   suitability conditions and unproven claims. Benchmark infrastructure is not a completed result.

The outcome is a research judgment: where this approach appears useful, how much work it saved
in the measured tasks, and where its limits remain. Negative or mixed findings are valid outcomes.
Neither productionizing the POC nor removing every coupling is required. Evidence from synthetic
logistics tasks does not establish enterprise-scale savings or a universal migration price.
