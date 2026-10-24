# Runnable demo checkpoint

Recovery ref: `demo-checkpoint-2026-10-24` (annotated tag).
Backup branch: `backup/demo-2026-10-24`.

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
