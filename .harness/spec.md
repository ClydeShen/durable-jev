# Spec: the agreed scope

The baseline is `prd.md` (v0.3). This file records the decisions agreed with the user; it wins on
any conflict.

## 1. Delivery

- Deliver in phases and take shape fast: an end-to-end slice that can be demonstrated early, then
  deepen step by step.
- Small commits; light unit tests only, no coverage target.
- Self-explanatory code: meaningful names, few comments.
- One command to build, one to start; the PRD's key points can be shown and checked with simple
  actions.
- A full demo without any key: model calls support a `scripted` replay mode; the user switches to
  `live` once they have keys.
- Development is always `scripted` and never calls the real Jev / NVIDIA (the user's request of
  2026-10-21). Only an explicit `MODEL_MODE=live` allows real calls; without an injected test
  transport, `JevJudge` / `StructuredOutputJudge` refuse to be built outside live mode. Once
  everything runs, switch to live to tune: question wording, label descriptions, probability
  thresholds and the authoring agent's prompt; no training or fine-tuning (a PRD 1.2 non-goal).
- Everything in the code base is English; only `docs/demo-guide.md`, the presenter's script, is
  Chinese (the user's request of 2026-10-23).

## 2. Folders

- `.harness/`: a shared working aid autonomously maintained by delivery agents for decisions,
  plans, limits, progress and handoffs. It is not the application runtime or permission to change
  owner agreements; protected files retain their existing restrictions.
- `docs/`: documents for the user (getting started, demo guide, runtime controls, M0 findings, final
  report).
- `eval/`: test materials, answer keys, fault scenarios, benchmark runner.

## 3. The runtime harness is a design thread

Purpose: when a reviewer asks "how does the agent runtime stay safe and under control", point at
the runtime harness and at where each control sits and what proves it.

- Every control lives outside the model and is enforced by deterministic code; the model only
  proposes a next step and has no authority.
- `packages/agent-harness` makes the controls first-class in its interface, not tied to Pi Durable.
- `docs/runtime-controls.md` lists each control: the means, where it sits, its source (Pi or this
  project), the PRD item, and the evidence (a test or fault experiment).
- Do not overstate Pi: capabilities not verified in P0 are not written as "provided by Pi".

## 4. Scope cuts (first round)

Not now, added later if needed:

- B5 (comparison with other durable frameworks).
- B6's performance tiers at 100 rules.
- The console's "experiment comparison" page (benchmark results go to report files first).
- The full 90 + 18 samples. The first round covers LOG-001 to LOG-008 and a few development samples
  per scenario family.

## 5. Labelling

The agent proposes answer keys; they count only after the user reviews them. Unreviewed labels are
marked `reviewStatus: draft` in their file, and results based on them are not evidence for any
conclusion.

## 6. External dependencies and credentials

The user obtains the keys for Jev and the generative model. Without a key, the related spike only
checks the interface shape and records that honestly in `docs/m0-findings.md`.

## 7. Model choice (2026-10-19)

- Only Jev for now (`TYPESAFE_API_KEY`, model `jev-1.14.0`).
- The generative model is NVIDIA (built into pi-ai, `NVIDIA_API_KEY`). Candidates:
  `nvidia/nemotron-3.5-lightning-30b-a3b` for B1 structured output and
  `nvidia/nemotron-3.5-super-vl-120b-a12b` for the investigation agent. The keys arrived on
  2026-10-21; with `MODEL_MODE=scripted` the scripted models (pi-ai faux provider) are still used.
- No other LLM besides Jev and NVIDIA.

## 8. Core concept: the Durable Jev Agent (2026-10-21)

The POC's starting point: when rules grow in number (tens of thousands in import and export
regulation, thousands of scenarios in cross-border logistics), structured and unstructured rules
interleave, and there is state and human work, the traditional "code + rule engine + decision
tables" takes a large team years. The aim is to show that a small team with a few Durable Jev
Agents might reach comparable results at substantially lower cost; an order-of-magnitude saving
is a hypothesis, not an acceptance condition or an established result. The principle: let agents do as
much as possible, leaving only the framework as hand-written code. The business scenario stays
logistics first, with motor insurance claims as the later cross-domain experiment.

- One business module = one Durable Jev Agent: a rule graph (declarative configuration:
  dependencies, applicability, state, invalidation) + leaf evaluators + human gates + Pi Durable
  persistence, exposed as an A2A agent.
- The rule-authoring agent (a generative model) writes the rules from the policy text: the rule
  graph, the expressions of structured rules, Jev's questions for unstructured rules; they take
  effect after human review. A policy change = edit the text → generate again → replay the labelled
  cases.
- At run time: Jev answers the unstructured rules (descriptions, notes, documents, customer
  instructions); structured rules (weights, times, amounts, matrices) deterministically run the
  expressions the authoring agent generated, doing what code does best.
- Grounds: in the probe of 2026-10-21, writing structured rules directly as Jev Noul questions got
  4 of 12 cases consistently wrong, all of them wrong releases (overload, over credit, temperature
  excursion, forbidden mixing).
- Each module owns its human tasks; the coordinator only aggregates the modules' states and runs
  the final release transaction.
- The investigation helper (a generative model + Pi Durable, an optional part inside an agent) is
  used only when the rules cannot reach a result and evidence or an alternative must be found.
  "Agent" means a Durable Jev Agent only.
- The agents: order coordination, cargo assurance, transport planning, commercial control, plus the
  destination compliance agent for the extension demo. They collaborate in three ways: dispatch and
  aggregation, peer requests, change notifications.
- The console has an overview: zoomed out to agent level, it shows each agent's basics and their
  relations at a glance; the same graph form zooms in to an agent's own rule flow.
- `docs/agent-architecture.md`, for a technical CEO: the agents and their responsibilities,
  collaboration patterns, how to extend, maintenance and operations, known limits.
- Questions to answer (measures for the CEO): the share of hand-written code; the share of rules
  Jev carries at run time and the share the authoring agent generated; the time one policy change
  takes; the cost of implementing one rule; wrong releases and other outcomes in a blind test.
  Zero wrong releases is a target, not a result to manufacture. Small-sample unit costs do not
  establish enterprise-scale savings.

## 9. Evaluation priority: reuse and migration economics

- Prioritize evidence for rule-authoring cost, blind evaluation and controlled comparisons.
- The research question is how far durable agents can reduce rule-engine development effort and
  form agentic workflows, under which conditions they fit, and where they need human intervention.
  Real-project reuse and comparisons with improving or rewriting engines motivate the experiments;
  production adoption is not this POC's acceptance criterion.
- Evaluate policy changes within a domain separately from moving to a different domain. Record
  reusable mechanisms, domain adapters, rule data, integration work and changes to shared code.
- Start with policy changes in logistics, then use motor insurance claims as the second domain.
  Keep the insurance experiment bounded by explicit synthetic policy terms and reviewed cases;
  it is not an insurance product or a legal-compliance assessment. No particular incumbent engine
  has been nominated, so do not invent one or present synthetic costs as an enterprise quote.
- Validate both policy activation strategies separately: existing orders remain on their prior
  policy, and unshipped existing orders are re-evaluated under the new policy. Keep their costs
  and outcomes distinct.
- Domain independence is a hypothesis to test, not an existing capability inferred from rule
  counts or package boundaries. Record the current coupling before changing it. The agreed
  pre-baseline cleanup is excluded from later experiment costs; additional adaptation after
  baseline freeze belongs to the measured candidate approach.
- Durable agents are intended to preserve common execution mechanisms as rules and domains
  change. Separate the benefits of declarative rules and adapters from the benefits of durable
  waiting, recovery and idempotency; neither establishes the other's benefit by itself.
- Use the same delivery tools and business acceptance criteria in the compared approaches.
  Synthetic baselines do not establish the migration cost of an unspecified incumbent system.

## 10. Research scope: capability, suitability and limits

- This is a capability-exploration POC, not a product delivery or a general-purpose engine build.
  Existing coupling and synthetic logistics materials are acknowledged experimental conditions.
- Measure policy interpretation, rule generation, review and repair effort alongside runtime
  investigation, tool use, collaboration, human waiting and recovery. Distinguish authored workflow
  logic from decisions the agent actually makes; an automated fixed path is not evidence of dynamic planning.
- Record unsuccessful attempts, unsupported changes, unsafe outcomes and manual interventions as
  findings. A negative result or a narrow useful capability is a valid research outcome.
- Do not automatically turn observed limitations into implementation requirements. Make only the
  changes needed for an agreed experiment, preserving the original baseline and accounting for effort.
- A domain-agnostic kernel, production policy routing and a production-readiness checklist are not
  prerequisites for answering the current questions. Do not extrapolate synthetic results into
  enterprise-scale savings or an order-of-magnitude cost claim without supporting measurements.

## 11. Extension shape: minimal SOLID

- Keep the repository small. Target a second-domain material pack plus only the domain-specific
  fact shapes, evaluators or tools the experiment actually needs, using the existing execution path.
- Do not duplicate the engine, runtime, services or console for insurance. Do not introduce a
  plugin framework, speculative abstraction layers or new packages for each minor responsibility.
- Extract only the smallest shared boundary required by demonstrated differences between the two
  domains. Keep business concepts in the domain pack; do not scatter domain-name conditionals
  throughout shared execution code or hide business logic inside generic configuration.
- The CEO-facing source walkthrough must show the complete migration diff: added materials,
  domain-specific logic, wiring and any shared-code changes relative to the frozen experimental
  baseline. Document pre-baseline cleanup separately, without charging it to later migration
  measurements. A small extension is the target to test, not a claim to manufacture.

## 12. Shared concept: domain agents with a common execution contract

- Necessary decoupling of the current implementation is in scope. Minimal SOLID does not mean
  preserving logistics-specific assumptions inside shared rule, runtime or transport contracts.
- Each domain supplies its agent responsibilities, policy/rule materials, typed business facts,
  tools and any special evaluators. A domain may contain several collaborating agents; keep the
  existing logistics agents rather than forcing one agent per industry.
- Share rule evaluation, agent lifecycle, durable execution integration and A2A task contracts.
  Structured rules, semantic judgments, human gates and tool-based investigation are capabilities
  of the same domain-agent concept, not separate industry-specific execution stacks.
- A2A standardizes discovery, task exchange and status, not business fact schemas. Validate those
  with the receiving domain's contract; do not obtain flexibility by removing validation.
- The current business runtime persists through its own SQLite store; Pi Durable checkpoints the
  investigation helper. Unifying the execution concept must explicitly identify checkpoint,
  resume and side-effect ownership. Do not claim that the whole flow runs on Pi Durable merely
  because the helper does, or maintain competing owners for the same workflow transition.
- Use the two concrete domains to drive the smallest shared contracts in existing packages.
  Keep declarative evaluation deterministic; agentic planning does not replace exact calculations
  or authorization checks. Preserve existing logistics outcomes throughout the extraction.

## 13. Checkpoint, cleanup and measurement order

Historical cleanup sequence, completed by the freeze in section 14; section 15 records its
documentation-only recovery revision. This is not an instruction to restart the cleanup.

- Preserve remote branch `backup/demo-2026-10-24` and annotated tag
  `demo-checkpoint-2026-10-24`, both resolving to commit
  `0265a05b3a8f4196133d6ee1d009c7a5ee44243f`. Do not commit to, force-push or move these refs.
  They preserve the runnable demo, not the future experimental baseline.
- Continue on `baseline-cleanup-plan`, branched from that checkpoint. The immediate step is
  documentation and a small-step cleanup plan, not automatic resumption of the shelved refactor.
- First tidy the shared core within the existing folder structure, package pattern and engineering
  rules. Keep the demo layout and behavior. Domain policies should use the same executable rule
  shape, with domain-specific facts, identities, tools and special logic supplied at the boundary.
- Validate each implementation slice with the relevant checks, and run `pnpm check`, `pnpm replay`
  and `pnpm faults` before every push. Start and inspect the demo for changes that can affect it.
  Keep source materials and skill files unchanged unless separately authorized as already specified.
- Freeze a distinct experimental baseline only after cleanup passes the gates and the owner has
  reviewed the preserved demo and scope. Record the commit, material hashes and environment.
- Then measure policy changes within logistics, including both existing-order strategies; next
  measure adaptation to motor insurance claims. Do not use pre-cleanup characterization as a
  completed post-baseline cost or blind-test result.
- Combining logistics vehicle-insurance work with insurance agents over A2A is an optional final
  bonus, not a prerequisite for the baseline, domain experiments or the existing demo.

## 14. Owner-approved experimental baseline freeze (2026-10-24)

- The owner accepted the functional and structural baseline and explicitly requested a separate
  archived recovery checkpoint. Accepted implementation: `78b139e788ec11a118c2433bc2a5f1bd4c85c3ac`.
- Annotated tag `baseline-2026-10-24` and backup branch `backup/baseline-2026-10-24` identify
  the documentation-only freeze commit after that implementation. Keep both unchanged, separately
  from the older demo recovery refs. Manifest and restore steps are in `docs/baseline.md`.
- T8.4 is complete. Further experiment work starts on a new branch from the frozen tag; all
  adaptations after this baseline belong to measured effort. Archiving starts no experiment
  and authorizes no protected-material edits or live model calls.

## 15. Baseline documentation recovery revision (2026-10-24)

- The owner requested that the recovery point include documentation aligned with the actual
  baseline. Correct stale design/ownership/interface claims and current handoff instructions;
  preserve historical experiments and the protected PRD/materials/skills unchanged.
- Current recovery tag: `baseline-2026-10-24-r2`; backup branch:
  `backup/baseline-2026-10-24-r2`. Preserve the original baseline refs at `25c7dbb` and original
  demo refs at `0265a05`, without moving or force-updating them.
- This is a documentation-only revision of the same experimental code/material baseline, not
  a new implementation baseline or a way to erase post-freeze adaptation costs. Later experiments
  branch from the revised recovery tag and preserve the original measurement boundary.
