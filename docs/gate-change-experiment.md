# Approval-chain and evidence policy changes

This completes a bounded P2/P3 logistics characterization, not the authoring-cost or blind-test
study. The owner approved both synthetic rules and both old-order activation modes on 2026-10-24.
The surrounding case labels remain draft. No live model is called and no protected material changes.

Run `pnpm check`, then `pnpm eval:gate-change`. Open the printed `report.md` and `report.json`
under `var/reports/gate-change-*`. Linux and Windows CI run the same command.

## Protocol and findings

P2 removes R13's cold-chain condition from the second approval: every controlled cargo item needs
compliance followed by a different quality reviewer. P3 adds `inspectionReportRef` to R21's
required repacking evidence. Both revise the corresponding policy paragraph in isolated copies.
Each starts independently from the unchanged baseline materials, not from the P1 candidate.

Each mutation has same-version and new-rule-version variants. Each variant runs six observations:
pending/completed orders with old-policy retention, pending/completed orders with re-evaluation,
a new affected case and an unaffected control. Total: 24 observations. LOG-003 uses its corrected
SDS revision for P2; LOG-008 uses its damaged-packaging revision for P3; LOG-001 is the control.

| Condition | Observed behavior | Implication |
|---|---|---|
| Retain old policy | Pending work uses original requirements; completed work stays complete | No new requirement is imposed on these old orders |
| P2, same version, re-evaluate | Pending case needs two signatures; completed first signature is retained and quality signs next | Reuses work in this case, but old/new tasks retain different `stepCount` metadata (1 and 2); not a general safe migration contract |
| P2, new version, re-evaluate | Old task is superseded; both signatures are required again | Consistent new chain, with an additional repeated compliance review for previously approved cargo |
| P3, same version, re-evaluate | Old open task accepts missing report; completed task remains PASS | New evidence requirements are not retroactively enforced on existing tasks |
| P3, new version, re-evaluate | Old task is superseded; missing report refused; complete evidence accepted | Works through existing invalidation, but requires another operation submission even if previously completed |
| New affected cases | Both variants enforce the new chain/evidence | A fresh-case test alone would miss the old-task problem |
| Unaffected cargo | Stays NOT_APPLICABLE with no human work | A version bump changes evaluation fingerprint metadata, not applicability |

Wrong-role actions are refused; P2 also refuses the first signer's identity on the second step.
Late actions against superseded pending tasks are refused. The command fails on these control
regressions or failure to enforce the versioned candidate; same-version limitations are retained
as observations, not represented as safe migration because the command exits successfully.

All five agents use file-backed SQLite stores. Each case closes/reopens them before propagation,
checking exact pre-propagation gate outcomes and task records. This is graceful store reopening,
not process termination, Pi recovery or an end-to-end dispatch claim. W1 supplies separate full
release/crash evidence; W2 supplies separate Pi controls. Pack selection is explicit experiment
assembly, not a production policy router or atomic cross-service deployment mechanism.

## Authoring preparation, not a cost comparison

The authoring CLI now selects one rule or a whole section and accepts isolated input/output paths:

```bash
pnpm author --materials "<isolated pack>" --output "<proposal directory>" R13
pnpm author --materials "<isolated pack>" --apply "<reviewed proposal.json>"
```

Proposals preserve input definitions, policy text, facts catalog, vocabulary constraints, raw
submissions, validation issues, duration and token reports. Provider request failures produce a
rejected receipt with unknown token usage rather than disappearing or pretending to cost zero.
Changed rules must have a different version; out-of-scope rules are rejected. This detects rule
definition changes, not changes to parameter values, and does not implement task migration.
`accepted` means structural/scope/version validation, never business approval. Apply is still an
explicit human-controlled command; it refuses a proposal bound to another material directory.
Protected-source changes still require separate owner consent and owner-run materials locking.

Each experiment replays two **synthesized** proposals: the manual candidate without a version
change (rejected), then with a new version (accepted), and applies the latter to its isolated input.
Applying to the wrong pack is also checked and refused before writing. The resulting rules in
the intended input copy must match the manual candidate. These are two integration rehearsals, four
recorded attempts, not independent policy interpretation or an agent-generated success rate.
Faux-provider token estimates are not live model usage or billing. Human minutes remain unknown.
The default `pnpm author "Schedule G"` recording remains compatible; it is not applied to source.

## Evidence, source boundary and effort

The run retains a pre-run plan, source revision/dirty status, executable hashes, all material
hashes, candidate copies, each scenario's observation and databases, authoring receipts and logs.
Source and candidate hashes are checked again after execution. Failed local attempts are retained
under their own run directories; rerunning never replaces another report.

The implementation adds three runner files in the existing `eval/runner/src/`, extends the existing
`FaultLab` with an optional materials directory, and extends `tools/rule-authoring/src/`. Shared
source-revision recording joins the existing experiment helper. CI and knip register one new entry.
No new package, dependency, business engine/runtime change, UI change or directory hierarchy.
For the complete migration boundary, compare `baseline-2026-10-24-r2..HEAD`, not only candidate JSON.

Preparation and repairs count as post-baseline work: initial declaration/event-discriminator fixes,
formatting ignored candidate files through stdin, removal of duplicated provenance code, and a
control correction separating changed version fingerprints from unchanged business applicability.
No runtime defect was patched to make this experiment succeed. Active human time and delivery-agent
cost were not measured, so this stage cannot establish savings.

Next: freeze an independent direct-edit versus authoring comparison, agree a bounded live-call
budget, and record human review/repair separately from generation. Independent held-out custody
and reviewed labels are still needed for blind claims. Insurance remains the next domain, not a
reason to skip these outstanding evidence limits.
