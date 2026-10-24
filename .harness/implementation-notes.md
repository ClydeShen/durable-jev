# Implementation notes

Only plan changes and high-level points that differ from spec, design or roadmap and that the user
should know.

## Current handoff: baseline cleanup plan (2026-10-24)

Read this section first when taking over from another delivery agent. The agreed scope is in
`spec.md` (especially sections 9-13); the execution order is in `roadmap.md` P8. Earlier dated
notes below are historical context, not instructions to override the latest owner decisions.

### Branches and recovery

- Repository: `ClydeShen/durable-jev`.
- Frozen remote backup branch: `backup/demo-2026-10-24`.
- Annotated recovery tag: `demo-checkpoint-2026-10-24`.
- Both resolve to source commit `0265a05b3a8f4196133d6ee1d009c7a5ee44243f`; origin was read back
  after the atomic push. Do not move, delete or force-push these refs. They are preserved by
  convention, not asserted to have GitHub protection rules.
- Backup CI completed successfully: https://github.com/ClydeShen/durable-jev/actions/runs/40045476530.
- Active planning/work branch: `baseline-cleanup-plan`, created from that commit. Push new work
  here, not to the backup. Do not open a PR without the owner's request or merge it automatically.
- The old branch `claude/wizardly-hopper-akkoyq` is historical, not the current continuation point.
  PRs #17 and #18 were merged before the checkpoint. No cleanup PR has been opened.
- Restore instructions: `docs/demo-checkpoint.md`. The checkpoint contains the polished logistics
  demo and initial evaluation probes; it excludes the incomplete core refactor.

### Shelved work is not the starting implementation

An interrupted decoupling attempt is preserved only in this local repository as stash commit
`646229f2622aa316e701778bd6ac292a4b31b10f` (initially `stash@{0}`, whose index can change).
It includes earlier UI/docs work already committed in the checkpoint as well as incomplete
core changes. Its attempted typecheck failed; it is not verified, pushed or part of the backup.
Do not blindly apply/pop it onto this branch. If needed, inspect it separately and select small
ideas after reviewing the plan. A fresh clone will not have this stash, and does not need it.

### Direction and constraints

This is research into durable-agent capability, suitability, limits and rule-development effort,
not product delivery. Standardize the domain-agent execution concept: policy/rules, typed facts,
tools and special evaluators belong to each domain; rule evaluation, durable execution integration
and A2A contracts are shared. One domain may own several agents. Keep the current directory
structure, package pattern, minimal SOLID approach and demo layout; no speculative plugin platform,
parallel insurance stack or packaging explosion.

The first domain remains logistics; the second is bounded synthetic motor-insurance claims.
Policies should share an executable shape without disguising claims as shipments or removing
domain validation. The optional final bonus is logistics vehicle-insurance work delegated to
insurance agents over A2A. It must not block the core experiments.

The owner clarified the measurement boundary: tidy the code first, preserve the demo, then freeze
the experimental baseline. This agreed cleanup is excluded from subsequent change/migration
costs. Changes required after freeze are measured. The runnable backup is not that future baseline.

### Work arrangement and next action

1. Continue on `baseline-cleanup-plan`. The owner authorized the two small cleanup stages;
   implementation has begun with rule validation and applicability indexing, not the shelved refactor.
2. Continue extracting the existing rule/fact contracts in small slices, then runtime and transport
   boundaries. Discuss uncertain durable-state ownership with the owner before changing it.
3. Keep every slice independently verifiable. Do not weaken validation, change protected materials
   to pass a check, or claim module-wide Pi Durable execution based on helper-only recovery.
4. At the cleanup gate, run full checks/replay/faults and inspect the running demo; ask the owner
   to review it before recording the experimental baseline commit and material/environment hashes.
5. After freeze, measure logistics policy changes (both existing-order strategies), then insurance
   adaptation; finish controlled comparisons, independent blind evaluation and the report.

### First cleanup slice: domain-owned selection constraints

`packages/logistics/src/rule-constraints.ts` now supplies allowed applicability dimensions,
the cargo-category vocabulary and the logistics extension-rule convention. Runtime pack loading
and the authoring CLI pass the same constraints into shared validation. The authoring CLI adds
one dependency on the existing logistics package; there is no new package or directory hierarchy.

The shared applicability schema retains dimension names instead of silently discarding them.
`RuleIndex` indexes dimension/value collections without interpreting business names, distinguishes
unresolved dimensions from resolved empty ones, and avoids delimiter collisions. Compatibility
table categories are also domain-supplied; core conflict/qualification checks remain shared.
The logistics boundary still rejects unknown dimensions/categories, incomplete tables and missing
extension applicability. Empty applicability on a logistics extension is now rejected too, rather
than making the extension unconditional. Existing committed materials satisfy these constraints.

Verification: `pnpm check` (142 tests, zero clones), eight scripted replay cases, fault scenarios
(17 pass; F06 not applicable), and 26 screening samples with no missed rules. S14 selects three
extra rules; these are development/screening results, not blind evidence. The default ports were
occupied by the checkpoint demo, so the candidate runs on ports 4300-4304 with separate temporary
data and control port 4399, using the existing launcher supervisor and built service entries.
Browser checks on that candidate passed filtering, drawers, scene dialogs, timeline and order
entry in both themes; 16 accessibility scans found no violations and no page errors were recorded.
The existing console layout is unchanged. No live model calls were made.

At the end of that first slice, fact/FEEL contexts still contained logistics assumptions; the
second slice below removes that fixed input shape. Rule owners/roles/scopes, invalidation dimensions
and graph-level classifier selection remain coupled. CaseRuntime, human
gates and A2A still accept Shipment; durable ownership has not changed. Do not claim cross-domain
execution or freeze the experimental baseline based on this slice. Protected materials, skills,
the backup branch and recovery tag remain unchanged.

### Second cleanup slice: normalized fact inputs and contexts

`CaseFacts` now carries root facts, scoped collections, a domain-built expression context and
an optional selection profile. Logistics supplies `order`, `cargoItems`, `legs`, `item` and `leg`
aliases in `buildCaseFacts`; the engine no longer constructs those business objects. Context
assembly, scope lookup and input-path reading are shared in the existing rule-engine files.
FEEL input fingerprinting recognizes supplied context roots rather than a fixed logistics list;
business data cannot override policy parameters. Customer/destination selection values now come
from logistics facts instead of being read from the order inside the graph evaluator.

This changes the input contract, not the wire scope identifiers or their storage keys. Shipment
validation and committed policy expressions are unchanged. RuleScope/CheckScope and scope-key
compatibility still use logistics vocabulary, as does classifier selection; those are subsequent
slices, not evidence of completed cross-domain execution. Runtime, persistence and A2A are untouched.

Verification: 145 tests with zero clones, eight scripted replay cases, the fault suite (17 pass,
F06 not applicable), and 26 screening samples with no missed rules. A one-off comparison against
`2e9d592` used the same fixed clock for all eight initial case views: records, outcomes, input
fingerprints and human tasks (including identifiers) matched exactly. Local artifacts are
`/tmp/durable-jev-before-facts-cleanup.json` and `/tmp/durable-jev-after-facts-cleanup.json`; they
are not committed and are not independent blind evidence. The candidate browser check uses
ports 4500-4504, control port 4599 and a separate temporary database, leaving earlier demos alone.
Browser interaction checks and 16 light/dark accessibility scans passed with no page errors;
the console geometry is unchanged. This isolated demo does not reset earlier demo databases.

Next: separate domain scope/identity vocabulary and classifier configuration without weakening
logistics validation or changing existing scope keys. T8.2 remains in progress; do not start cost
measurements, freeze the baseline, or restore the shelved refactor automatically.

At the checkpoint, `pnpm check` passed (131 tests, no clones), all eight scripted replay cases
passed, and the fault suite held (17 pass, F06 not applicable because the UI polls). A fresh
`pnpm start` and browser checks covered light/dark views, filtering, drawers, scene dialogs,
timeline and order entry; 16 accessibility scans had no violations. These are demo/regression
checks, not independent blind evidence or measured authoring savings.

Known research boundaries to retain: business waiting/state currently uses the project SQLite
runtime; Pi Durable checkpoints the investigation helper, with module-level feasibility shown
separately in a spike. Some cross-agent behavior is coordinator propagation, not autonomous peer
planning. The pre-cleanup P1 probe shows a parameter-only R35 change can leave a stale approval
task, while a version bump cancels it but can require extra approvals. Preserve those observations;
re-run characterization after cleanup rather than treating the probe as a baseline cost result.

Follow the existing engineering rules: scripted mode by default, no live calls without explicit
authorization, full `pnpm check`, `pnpm replay`, `pnpm faults` before every push, and small
Conventional Commits. Protected materials require owner consent and owner-run materials locking.
Installed delivery-agent skills are read/use-only, not project source to modify.

## Historical decision log

| Date | Point | Effect |
|---|---|---|
| 2026-10-24 | Preserve the verified demo remotely, then plan a demo-preserving core cleanup before freezing the experimental baseline; logistics changes precede motor insurance, with cross-domain A2A optional | Backup `0265a05`; working branch `baseline-cleanup-plan`; P8 defines the new order; pre-baseline cleanup is excluded from later change/migration costs |
| 2026-10-19 | Jev has an official TS SDK, `@typesafe-ai/sdk` (earlier wrongly thought missing); the key variable is `TYPESAFE_API_KEY` | T0.5 needs no hand-written client; real calls wait for the key, T0.5 stays in progress |
| 2026-10-19 | Dependencies chosen at their latest: pi-durable 1.3.0, pi-ai 1.3.0, @a2a-js/sdk 1.3.0 | Pinned after P0 verification |
| 2026-10-19 | TypeScript 6.0.3 rather than the latest 7.x (native compiler), to avoid compatibility risk with `tsc -b` project references | No functional effect |
| 2026-10-23 | TypeScript stays at 6.0.3 (latest 6.x) although 7.0.2 builds this repository: dependency-cruiser needs the TypeScript compiler API, which 7.x has not published, and with 7.x the boundaries check cruises no modules | Revisit once dependency-cruiser supports 7.x |
| 2026-10-19 | HTTP framework moved from Fastify to Express 5: the A2A SDK's server only has an Express adapter, and one framework is simpler | Design updated |
| 2026-10-19 | The A2A SDK does not deduplicate by messageId; F04 idempotency needs our own mapping | Within T5.1, no extra task |
| 2026-10-19 | The generative model is NVIDIA (built into pi-ai), only Jev for now; until the NVIDIA key arrives the B1 baseline and the investigation agent use scripted models | T4.2's StructuredOutputJudge and the real-model parts of B1/B2 postponed |
| 2026-10-21 | Jev and NVIDIA keys arrived, T0.5 real calls pass; T4.1/T4.2 done before P1–P3 | Semantic question and answer types live in `model-providers` for now; T1.1 does not define them again |
| 2026-10-21 | NVIDIA Nemotron does not support strict JSON schema in pi-ai; StructuredOutputJudge forces a tool call and validates the schema locally, failing on invalid output | B1 must count structured-output format failures |
| 2026-10-21 | NVIDIA model prices in the pi-ai catalogue are 0 (not reported by the provider), and Jev also returns `output_tokens` | B1 prices by token counts separately rather than the catalogue cost |
| 2026-10-21 | Considered adding Protégé / an ontology (ontology + Jev vs code + Jev): not doing it. Within Node and without Java there is no mature OWL DL reasoner, and what remains (RDF rules, SHACL) is equivalent to JSON decision tables; at this rule scale the gain does not cover the cost | None. Kept the useful parts: one source for categories and Jev labels (T3.1/T4.3), contradiction checks on the compatibility matrix (T1.3) |
| 2026-10-21 | Core concept fixed as the Durable Jev Agent (spec 8): a module = Jev + Pi Durable + rule graph + human gates, collaborating over A2A; structured rules stay code. Human tasks move from the coordinator into the modules | Changed design 6 and roadmap T1.7/T2.3/T3.2/T4.7; added the T0.8 spike and T7.6 (B7) |
| 2026-10-21 | Direction clarified: let agents do as much as possible, aiming at "a small team plus Durable Jev Agents replacing a rule engine a large team built over years". Added a rule-authoring agent (T3.0); T3.1 becomes generation plus review; B7 becomes a cost measure for the CEO. Business scenarios and finished work unchanged | Roadmap T3.0/T3.1/T7.6 |
| 2026-10-21 | Human approval supports chains of 2–3 roles (sequential or parallel, four eyes, conditional extra steps) | contracts humanTask gains `approvalChain`; design 5.2/5.5; T1.7 widened; T2.1/T3.1 policy designs chains for R13, R20, R34 and others |
| 2026-10-21 | Added the extension pack (100–200 appendix rules written by the agent) and selection of applicable rules; rule ids widened to `R\d{2}` or `CUST-*` / `DEST-*`; added R41, which aggregates destination import requirements | Roadmap T1.3/T3.7/T3.8/T7.6 |
| 2026-10-21 | Agents fixed as order coordination, cargo assurance, transport planning, commercial control, plus destination compliance (the extension demo); "agent" means a Durable Jev Agent only, and the LLM loop is the investigation helper; added peer collaboration; the console gets an agent-level overview sharing the graph component with the rule view | Design 2/6/9.1; roadmap T2.5/T3.2/T3.2a/T5.2a/T6.3a/T7.7 |
| 2026-10-21 | Real model calls off during development: Jev and NVIDIA are called only with `MODEL_MODE=live`, and the real judges refuse to be built otherwise; added T7.0 live tuning (no fine-tuning) | Spec 1; roadmap T7.0; spikes follow MODEL_MODE |
| 2026-10-22 | Development stays scripted throughout, so the authoring agent cannot really generate: 40 rules were written by hand first as the "human-reviewed baseline" (R28 is a candidate-plan check template outside the release graph, so 39 nodes); the authoring pipeline is developed with a scripted model, and in T7.0 live the real model generates from the policy text and is compared with the baseline | T3.1 stays in progress; B7's authoring-quality evidence comes from that comparison |
| 2026-10-22 | Cross-agent dependencies propagate through the coordinator's rounds (a hub); true peer-to-peer requests come from the helper's reroute proposals (transport → commercial approves the cost, transport → cargo re-checks the candidate plan); T3.2a goes with T4.6 / T5.1 | Roadmap T3.2a dependencies adjusted |
| 2026-10-23 | Toolchain and dependencies moved to their latest stable versions (ES2025 target; Pi Durable 1.4.0, whose `TaskRuntime.sleep` is gone and whose SQLite store migrates one way) | The Pi Durable spike uses a phase timer for approval expiry; fault scenarios, replay and spikes pass again |
