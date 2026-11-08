# Current delivery handoff

This file contains current continuation instructions only. Agreements are in [spec.md](spec.md),
task status in [roadmap.md](roadmap.md), and evidence/cost entries in
[workflow-progress.md](../docs/workflow-progress.md). Superseded instructions and implementation
history remain in Git.

## Continue here

Use the active work branch defined in [branch-strategy.md](../docs/branch-strategy.md).
Primary goals are defined in spec section 9: policy/engine isolation, configurable decision models,
A2A operation/configuration and durable stability/robustness. Code/authoring effort is secondary.
Use the milestone acceptance boundaries in the branch strategy and tasks T8.5/T8.8/T8.9/T8.6.

Draft scope metadata is protected by strict schemas and declared-field storage. Settled Pi
schema/unknown-tool refusals are audited with call IDs and rejection codes; F09 checks the outbox.
Continue primary model-configuration/substitution validation using existing adapter interfaces,
then review policy and A2A evidence against their acceptance boundaries. Unstarted work is not
a design deviation.

Review existing policy and recovery evidence against primary acceptance before expanding tests
or benchmarks. Document tools and reroute controls have separate evidence owners in the progress
index. A future live run still needs frozen inputs and the applicable authorization; changing
priorities does not grant new provider calls. M3/M4 remain unstarted; detailed status is in the
progress index.

## Execution constraints

- Follow the verification self-check in [AGENTS.md](../AGENTS.md).
- Experimental context/custody requirements are in
  [evaluation-plan.md](../docs/evaluation-plan.md#clean-context-experimental-agents-owner-requirement).
- Live-model authorization is in [spec.md, section 17](spec.md#17-bounded-live-jev-authorization-2026-10-24).
  Read the authoritative `jev-allowance.jsonl` before any live request. NVIDIA requires separate
  authorization. Do not restore an old journal to refund requests.
- Source materials, their lock and `prd.md` retain owner-consent restrictions. Installed delivery
  skills are use-only. See [engineering.md](../docs/engineering.md) and AGENTS.md.
- Before every push run `pnpm check`, `pnpm replay` and `pnpm faults`. Inspect the running demo
  for changes affecting its behavior or appearance.
- Small steps use commits. Milestone archives require acceptance and synchronized evidence,
  handoff and presenter script; do not create per-step backup branches.

## Recovery cautions

Use [branch-strategy.md](../docs/branch-strategy.md) for reference identities and retired-branch
tag mappings. Baseline restoration is documented in [baseline.md](../docs/baseline.md); demo
restoration in [demo-checkpoint.md](../docs/demo-checkpoint.md). Do not resume baseline cleanup.

An incomplete pre-baseline refactor exists only as local stash commit
`646229f2622aa316e701778bd6ac292a4b31b10f`. It failed typechecking and overlaps committed work.
Do not apply it wholesale; a fresh clone does not need it.

## UI constraint

Preserve the current graph layout and navigation contract in [design.md](design.md).
