# Evaluation plan: durable-agent capabilities and development cost

Status: experiment design and source audit, not a performance or cost result. The immediate
priority is a demo-preserving shared-core cleanup, followed by an explicit baseline freeze.
Only then measure logistics policy changes and motor insurance adaptation. There is
no nominated incumbent engine; large real-world rule estates motivate the question, not a
specific product comparison.

This is a capability-exploration POC, not a product delivery. The central hypothesis is that
durable agents can reduce the effort of building and changing rule-driven workflows. Explore
feasibility, suitability and limits; do not require a fully decoupled engine before measuring.
Current coupling and synthetic materials bound the conclusions rather than invalidate the research.

## Measurement boundary

The runnable checkpoint `demo-checkpoint-2026-10-24` (`0265a05`) is a recovery point, not the
experimental baseline. The owner explicitly excludes the agreed pre-baseline cleanup from later
policy-change and cross-domain migration costs. Document that preparation separately; do not
present subsequent results as the total cost of creating the engine from scratch.

Freeze the baseline after the cleanup gates and owner review, recording the commit, material
hashes and environment. Count all further adaptation, preparation, review and failed attempts
required by each measured experiment. Do not move the baseline retrospectively to exclude costs.
The source audit and P1 observations below describe the pre-cleanup checkpoint and must be
re-characterized after freeze, not relabeled as post-baseline or blind results.

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

## Pre-cleanup boundary: retain as historical evidence

The following audit describes the recovery checkpoint, not a claim that every coupling remains
unchanged. The first cleanup slice makes applicability indexing dimension-agnostic and supplies
selection/table vocabulary from logistics constraints. Unknown applicability keys are retained by
the shared schema and rejected when unsupported by the logistics validator, rather than stripped.
Owners, roles, scopes, fact contexts, classifier selection and runtime payloads still require
further cleanup. Current progress is recorded in `.harness/implementation-notes.md`.

`pnpm eval:portability` records schema compatibility probes and LF-normalized source hashes in
`var/reports/portability-baseline.json`. It does not call models, modify source materials or
validate business correctness. Its observations describe the working tree named by the hashes,
not an assumed clean commit. Archive the report with the commit and diff used for each experiment.

| Layer | Current reuse evidence | Current domain assumption |
|---|---|---|
| Rule definitions | FEEL expressions, dependencies, semantic questions and human gates are data | Owners and roles use logistics enums; scopes are order, cargo item and leg |
| Evaluation | A common graph evaluator handles all owners | Facts and expression contexts name order, cargo items and legs; the decision table implements cargo mixing |
| Selection and invalidation | Indexed applicability and input fingerprints are reusable mechanisms | Selection dimensions are destination, customer and commodity group; invalidation dimensions are fixed to logistics |
| Business runtime | A common runtime owns outcomes and human tasks | `CaseRuntime`, `CaseStore` and `HumanGateSession` accept `Shipment` |
| Authoring | Policy text produces proposals with schema/graph validation and token/time records | The prompt describes shipment release, and the CLI uses the logistics rule pack, fact catalog and code evaluator R29 |
| Recovery and transport | The investigation helper checkpoints through Pi Durable; native HTTP and A2A share an `AgentClient` contract | Service assembly, roles, business tools and release transactions still implement logistics |

Relevant sources: [rule-definition.ts](../packages/rule-engine/src/rule-definition.ts),
[facts.ts](../packages/rule-engine/src/facts.ts), [feel.ts](../packages/rule-engine/src/feel.ts),
[rule-selection.ts](../packages/rule-engine/src/rule-selection.ts),
[case-runtime.ts](../packages/agent-core/src/case-runtime.ts),
[author-rules.ts](../tools/rule-authoring/src/author-rules.ts) and
[investigator.ts](../packages/agent-harness/src/investigator.ts).

The initial probe accepts a different amount expression in the existing envelope, but refuses
a new owner, scope, role or invalidation dimension. An unknown applicability key is currently
accepted and stripped: `riskLevels` becomes an empty applicability object. Schema acceptance
therefore must not be counted as successful migration. Record this as an unsupported behavior;
if a later experiment needs a fix, retain the baseline and account for the additional effort.

Do not rename purchases to shipments and count that as domain independence. A future domain
experiment must name its real concepts and report the required adapters and shared-code changes.

## First experiment: logistics policy changes

The following are concrete proposed mutations, not approved policy changes or reviewed labels.
Use isolated candidate packs; leave `eval/materials/` and its lock untouched. Review each revised
policy paragraph and its expected business behavior before generation or acceptance scoring.

| ID | Proposed change | What it tests | Required observations |
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

### P1 characterization command and initial observations

After `pnpm check` has built the runner, run `pnpm eval:policy-change`. It creates a new directory
under `var/reports/policy-change-*`, copies the source materials, and changes only the copies.
Each directory contains baseline and candidate packs plus JSON and Markdown reports. No live
model is called; the command refuses `MODEL_MODE=live`.

Two candidate variants isolate parameter-only edits from an edit that also raises R35's rule
version and the rule-set version. Each variant records 22 observations: paired new-order boundary
cases under both packs, unchanged controls, pending approvals and previously completed approvals
under both activation strategies. The runs are deterministic characterization, not blind samples.
The copied policy paragraph is unchanged, and the mutation remains `reviewStatus: draft`.

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

Raising the rule version makes the existing task machinery observe a different fingerprint.
It also conservatively requires another approval for the NZD 800 case, although that amount is
above both thresholds. Count that reapproval as work; do not silently assume it is free or always
the desired migration policy.

These observations establish a capability boundary. The experiment chooses packs explicitly and recreates the commercial runtime
over the same in-memory store; there is no implemented production version router, policy-text
generation comparison, whole-order release score or restart-during-policy-transition result.
Timings cover one local runtime initialization/evaluation. Human effort and preparation cost
remain unmeasured. Preserve both variants rather than repairing the engine before reporting the baseline.

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

### Current extraction points

- Rule contracts currently fix logistics owners, roles, scopes, selection dimensions and change
  dimensions. Move their business definitions behind the smallest validated domain boundary.
- `CaseRuntime`, `CaseStore`, human gates and `AgentClient` currently accept `Shipment`. Separate
  shared case identity/revision and task mechanics from each domain's validated business payload.
- `DurableInvestigator` already accepts a generic scope and domain tools, but Pi Durable currently
  checkpoints investigation rather than the entire business workflow. Specify the ownership of
  durable transitions and replay-safe side effects before extending its responsibility; retain
  deterministic rule evaluation and the existing recovery baseline.
- Native/A2A adapters should carry the common agent operations without importing logistics facts.
  Domain assembly provides agent identities, responsibilities and business validation.

These are implementation boundaries to resolve incrementally, not a claim that generic types
alone establish portability. Verify logistics parity before adding insurance, then run both
through the same execution contracts. Record any remaining exception explicitly.

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
