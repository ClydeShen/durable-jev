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

- `.harness/`: the source of truth for implementation, managed by the agent.
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
Agents reaches the same result at an order of magnitude lower cost. The principle: let agents do as
much as possible, leaving only the framework as hand-written code. The business scenario stays
logistics; the demo and the report are organised around this direction.

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
  takes; the cost of implementing one rule; zero wrong releases in a blind test. The 40-rule
  results are extrapolated only as a unit cost, with the extrapolation's assumptions stated.
