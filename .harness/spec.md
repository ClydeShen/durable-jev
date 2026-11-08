# Spec: the agreed scope

## Branch policy amendment (owner-approved 2026-10-25)

Follow [branch-strategy.md](../docs/branch-strategy.md) for the accepted working/reference branch
policy, archive conditions and recovery identities. It supersedes earlier per-stage backup plans.

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
checks the interface shape and records that honestly in `docs/archive/m0-findings.md`.

## 7. Model choice (2026-10-19)

- Only Jev for now (`TYPESAFE_API_KEY`, model `jev-1.14.0`).
- The generative model is NVIDIA (built into pi-ai, `NVIDIA_API_KEY`). Candidates:
  `nvidia/nemotron-3.5-lightning-30b-a3b` for B1 structured output and
  `nvidia/nemotron-3.5-super-vl-120b-a12b` for the investigation agent. The keys arrived on
  2026-10-21; with `MODEL_MODE=scripted` the scripted models (pi-ai faux provider) are still used.
- No other LLM besides Jev and NVIDIA.

## 8. Core concept: the Durable Jev Agent (2026-10-21)

The primary goal is a rule engine composed of durable domain agents, with policies isolated from
shared execution through a validated, versioned policy/domain contract. Decision providers such
as Jev are configurable through explicit interfaces. A2A standardizes agent discovery, capabilities,
task exchange and configuration. The POC evaluates policy replacement, model substitution and
execution robustness on synthetic logistics and bounded motor-insurance cases.

Development/code-effort savings are a secondary measurement. They are recorded where observable
but do not gate acceptance of the primary capabilities. Existing cost records, unknown values
and the frozen baseline boundary remain valid.
"Durable Jev Agent" remains the project's historical label; it does not restrict the provider
interface to Jev. Current Pi/SQLite ownership is stated in section 12, not inferred from the label.

- One business module = one Durable Jev Agent: a rule graph (declarative configuration:
  dependencies, applicability, state, invalidation) + leaf evaluators + human gates + Pi Durable
  persistence, exposed as an A2A agent.
- Optional rule authoring (a generative model) writes the rules from the policy text: the rule
  graph, the expressions of structured rules, Jev's questions for unstructured rules; they take
  effect after human review. When authoring is used, the path is policy text → generation → review
  → replay. Reviewed direct rule-data changes also satisfy policy-replacement experiments.
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
- Secondary measures for the CEO: the share of hand-written code; the share of rules
  Jev carries at run time and the share the authoring agent generated; the time one policy change
  takes; the cost of implementing one rule. Small-sample unit costs do not establish enterprise-scale
  savings. Wrong releases and other validation failures are primary robustness findings;
  zero wrong releases is a target, not a result to manufacture.

## 9. Evaluation priority: configurable policy-driven durable agents

Primary acceptance concerns:

- Policy isolation: use a versioned rule graph, typed facts, parameters and registered domain
  evaluators/tools as the engine input contract. Replace policies without embedding their terms
  in shared execution code. Validate policy changes and both existing-order activation modes.
- Model configuration: use a declared decision-provider contract, with Jev as the priority real
  provider. Verify compatible substitution, output validation, uncertainty and failure behavior;
  do not assume all providers expose identical capabilities.
- A2A operation/configuration: verify discovery, capability/task contracts, agent identity,
  endpoint/profile configuration and receiving-domain validation. A2A standardizes agent exchange,
  not the policy language or all industries' fact schemas.
- Stability and robustness: identify actual state/checkpoint owners; verify waiting, restart,
  idempotent side effects, stale decisions, invalid inputs and bounded failures in the rule-engine
  use case. Preserve observed limitations and distinguish scripted controls from model decisions.
- Flexibility: change policies within logistics, then execute a bounded motor-insurance policy
  through the same shared path. Show all materials, domain adapters, wiring and shared-code changes.

Secondary measurements include code work, authoring/review/repair effort, model cost and fixed-flow
effort comparisons. Record failures and unknowns honestly; do not manufacture savings or delay a
primary milestone solely for an optional cost benchmark. Large model/provider performance matrices,
automatic policy authoring comparisons and cross-domain A2A are optional extensions.

The agreed pre-baseline cleanup remains outside later adaptation measurements; work after freeze
remains attributable. No nominated incumbent engine exists. Synthetic results do not establish
enterprise migration pricing, production readiness or a universal savings factor. Untested work is
incomplete, not a design deviation; deviation requires implemented behavior that conflicts with an
accepted contract.

## 10. Research scope: capability, suitability and limits

- This is a capability-exploration POC, not a product delivery or a general-purpose engine build.
  Existing coupling and synthetic logistics materials are acknowledged experimental conditions.
- Record observable policy interpretation, rule generation, review and repair effort alongside runtime
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

The runnable demo was preserved before cleanup. The accepted experimental baseline excludes
agreed pre-baseline preparation costs; all further adaptations count. Keep logistics behavior,
folder structure and code patterns while testing policy changes, durable investigation and
cross-domain reuse. Do not restart the completed baseline cleanup.

## 14. Owner-approved experimental baseline freeze (2026-10-24)

The owner accepted the functional and structural baseline. [baseline.md](../docs/baseline.md)
and its manifest own the accepted implementation, hashes, evidence and restoration instructions.
Keep frozen references unchanged; freezing grants no protected-material or live-call permission.

## 15. Baseline documentation recovery revision (2026-10-24)

The r2 recovery revision aligns documentation with the same accepted code/material baseline.
It does not reset costs or replace original evidence. Reference identities and retired-branch
mappings belong to [branch-strategy.md](../docs/branch-strategy.md).

## 16. Post-baseline workflow implementation (2026-10-24)

- Continue the durable agentic workflow POC on the active work branch; no automatic PR or merge.
- Use the four milestone scopes in the branch strategy and task acceptance in the roadmap.
- Keep a complete post-baseline diff and effort ledger. Technical review examines contracts,
  state ownership and reuse; business review examines policy effects, effort and limitations.
- Approved logistics mutations are P1 (threshold), P2 (second sign-off) and P3 (inspection report),
  defined in [evaluation-plan.md](../docs/evaluation-plan.md#first-experiment-logistics-policy-changes).
  Validate both old-policy retention and new-policy re-evaluation. Approval covers those synthetic
  mutations, not all surrounding labels or edits to protected source materials.
- Clean-context experimental method and custody are defined in the evaluation plan.
- Every milestone archive includes current evidence, handoff and presenter actions. Current docs
  record accepted scope, observable state and reproducible evidence; discussion and implementation
  chronology remain in Git. Document ownership is defined in [README.md](README.md).

## 17. Bounded live Jev authorization (2026-10-24)

- The owner authorizes up to five real Jev API request attempts in each of four next steps:
  rule-authoring/review cost evaluation, agent versus fixed-workflow comparison, independent
  blind evaluation, and motor-insurance adaptation. Total ceiling: 20 attempts from this approval.
- Use the allowance only at suitably prepared checkpoints, after scripted checks and input/
  acceptance criteria are frozen. It is a ceiling, not a requirement to spend all calls.
- Count actual outbound Jev request attempts, not whole runs or calls to a wrapper function.
  Retries and failed/timed-out requests consume allowance once attempted. Do not transfer unused
  allowance across steps, reset it after restart, or start an unrestricted live replay.
- Before the first request, enforce and persist the per-step/total allowance at the request
  boundary. The existing SDK disables its own retries, but that is not a cross-run budget guard.
  These are authorization rules; recording them does not itself implement that guard.
- This approval is for Jev only. NVIDIA generation/planning calls require separate approval;
  there is no implicit authorization from enabling MODEL_MODE=live or possessing API keys.
- Five calls per step support bounded probes, not statistical accuracy, savings or scale claims.
  Blind inputs/answers require independent custody; all existing protected-material restrictions
  remain. Earlier historical calls are outside this newly granted allowance.
