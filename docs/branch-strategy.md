# Branch and milestone strategy

Owner-approved consolidation, 2026-10-25. This policy supersedes the earlier practice of creating
a tag and backup branch for every experiment slice. Historical evidence and commits stay intact.

## Working and reference branches

| Branch | Purpose | Policy |
|---|---|---|
| `feat/durable-policy-workflow` | The only active experiment branch | Continue all four milestones here; use small commits for intermediate progress |
| `main` | Integration mainline | Not necessarily the latest experiment; PR and merge require owner direction |
| `backup/demo-2026-10-24` | Original runnable demo, `0265a05` | Frozen historical reference |
| `backup/baseline-2026-10-24-r2` | Official documented baseline, `57373a8` | Frozen comparison and recovery reference |

Do not rename the two historical reference branches just for naming symmetry. Their existing
tags and documented identities remain valid. The original baseline `25c7dbb` remains recoverable
through tag `baseline-2026-10-24`; r2 is the single normal baseline entry point.

## Four numbered milestone archives

| Branch to create only after acceptance | Scope | Acceptance boundary |
|---|---|---|
| `milestone/01-logistics-policy` | Logistics policy contract and replacement | Validated policy/engine boundary and both existing-order activation modes; behavior and limits reviewed |
| `milestone/02-durable-workflow` | Decision-model configuration, A2A and durable execution | Compatible model substitution, standardized agent configuration/task exchange, recovery and failure evidence with state owners identified |
| `milestone/03-blind-evaluation` | Independent validation and capability limits | Frozen candidate and bounded independently held cases; invalid inputs, uncertainty and failures reported |
| `milestone/04-insurance-migration` | Bounded motor-insurance policy replacement | Shared execution path with complete materials/domain/wiring/core diff and limitations |

Current acceptance status is maintained in [workflow-progress.md](workflow-progress.md).
Completion requires the agreed evidence, passing checks,
synchronized handoff and demo script, and owner confirmation. Create one frozen branch per
completed milestone from the accepted commit; never develop on or move it. Do not pre-create
four empty branches. Optional cross-domain A2A is a bonus, not a fifth required milestone.

Small steps use commits and progress notes, not new branches or tags. All milestones share the
working branch; the numbered names classify accepted snapshots, not parallel workstreams.
Primary and secondary goals are defined in spec section 9. Code/authoring cost comparisons are
secondary evidence, not archive gates. NVIDIA authoring is optional. Live authorization is in
spec section 17; consumed Jev reservations are in
`.harness/jev-allowance.jsonl`. Restoring code never refunds requests.

## Consolidated historical snapshots

The following remote tags preserve the exact tips of the retired redundant branches. Tags are
not moved or deleted; no source history is rewritten.

| Retired branch | Retained tag | Commit |
|---|---|---|
| `backup/baseline-2026-10-24` | `baseline-2026-10-24` | `25c7dbb` |
| `baseline-cleanup-plan` | `baseline-2026-10-24-r2` | `57373a8` |
| `backup/workflow-plan-2026-10-24` | `workflow-plan-2026-10-24` | `31ae95b` |
| `backup/workflow-policy-continuity-2026-10-24` | `workflow-policy-continuity-2026-10-24` | `160dc02` |
| `backup/workflow-investigation-controls-2026-10-24` | `workflow-investigation-controls-2026-10-24` | `59caea6` |
| `backup/workflow-gate-changes-2026-10-24` | `workflow-gate-changes-2026-10-24` | `d520c01` |
| `backup/workflow-readability-2026-10-24` | `workflow-readability-2026-10-24` | `0398265` |
| `backup/workflow-live-semantic-probe-2026-10-24` | `workflow-live-semantic-probe-2026-10-24` | `99c5273` |

Older evidence documents mention matching backup branches as a historical record. Use the
retained tag instead. A separate recovery checkout can be made with
`git worktree add --detach <new-directory> <tag>`; do not run live experiments from its old journal.

Unrelated remote branches `ClydeShen-patch-1`, `ClydeShen-patch-2`, `claude/happy-wright-ear6xc`,
`claude/new-session-nqth0v`, `claude/wizardly-hopper-akkoyq` and `codex/install-ui-ux-pro-max`
remain untouched pending separate PR/unique-commit review. Local `work` and
`backup/pr17-before-ci-fix` also remain untouched. Their presence does not designate active work.

Earlier W1/W2 labels remain evidence-slice identifiers under M1/M2. Earlier planned W3 insurance
maps to M4; W4 synthesis/blind work maps to M3 plus final reporting and optional A2A. Use M1–M4
for current milestone status, not the historical W numbering.
