# Runnable demo checkpoint

Recovery ref: `demo-checkpoint-2026-10-24` (annotated tag).
Backup branch: `backup/demo-2026-10-24`.
Resolved source commit: `0265a05b3a8f4196133d6ee1d009c7a5ee44243f`.

The branch and tag were pushed and independently read back from origin. These refs are to be
kept unchanged by convention; no GitHub branch/tag protection rule is claimed here.

The backup's [GitHub Actions run](https://github.com/ClydeShen/durable-jev/actions/runs/40045476530)
completed successfully on that commit, in addition to the local verification.

This snapshot preserves the logistics demo, UI refinements and initial evaluation probes before
the shared-core refactor. It does not contain the in-progress domain-decoupling changes. Keep
the recovery tag and backup branch unchanged; perform future work on a separate branch.

Restore into a separate directory, without overwriting another working tree:

```sh
git clone --branch demo-checkpoint-2026-10-24 https://github.com/ClydeShen/durable-jev.git durable-jev-demo
cd durable-jev-demo
pnpm bootstrap
pnpm start
```

Use Node 26.12.1 and pnpm 12.15.0. The default scripted demo needs no model credentials. The
console opens at http://localhost:4100; see `docs/demo-guide.md` for presentation steps.

This is a source checkpoint, not a backup of credentials, installed dependencies, generated
reports or the current local database. The demo initializes from the committed logistics
materials. Protected materials and delivery-agent skills are unchanged.

The future experimental baseline is separate: finish and verify the agreed code cleanup first,
then freeze that baseline. Cleanup effort is not part of subsequent policy-change or cross-domain
migration cost measurements. Logistics-to-insurance A2A cooperation remains an optional bonus.

The working branch is `baseline-cleanup-plan`, created from this checkpoint. Read the current
handoff in `.harness/implementation-notes.md` before resuming implementation. Changes to this
document on that working branch do not change the frozen recovery tag or backup branch.
