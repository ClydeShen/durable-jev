# Frozen experimental baseline

Status: accepted by the owner and frozen on 2026-10-24.
Current recovery tag: `baseline-2026-10-24-r2` (annotated documentation revision).
Backup branch: `backup/baseline-2026-10-24-r2`.
Accepted implementation: `78b139e788ec11a118c2433bc2a5f1bd4c85c3ac`.
Both current refs include documentation aligned with the actual runtime and handoff, plus
[baseline-manifest.json](baseline-manifest.json). Application source, engineering configuration,
dependencies and materials are identical to the original freeze. The original baseline tag
`baseline-2026-10-24` and branch `backup/baseline-2026-10-24` remain unchanged at
`25c7dbb425ce365c61a0db0bdab8f1dcdc7e549b`. This is a recovery-document revision, not a new
implementation baseline or a reset of experiment costs.
The earlier runnable-demo backup remains `backup/demo-2026-10-24` /
`demo-checkpoint-2026-10-24` at `0265a05`; it is not the experimental baseline.

This is a research POC, not an insurance product or a production-ready general-purpose engine.
The two cleanup stages establish a small shared execution boundary without changing the existing
folder hierarchy, logistics materials, demo layout or dependency versions. No insurance policy
experiment or change-cost measurement has started. Agreed cleanup is excluded from later costs;
additional adaptations after freeze must be counted.

## Shared core and domain assembly

- The executable rule shape describes owners, scopes, dependencies, evaluators, applicability,
  human gates and invalidation. `rootScope` and classifier scope/dimension are explicit. The loader
  supplies metadata from logistics assembly for the unchanged legacy material pack.
- `CaseFacts` exposes root facts, scoped collections, expression aliases and selection values.
  The domain supplies its own vocabulary and validated business data; the engine does not build
  shipments or infer customer/destination dimensions. Unknown domain vocabulary is rejected.
- `CaseStore<T>` uses a domain parser for reads/writes. `CaseRuntime<T>` evaluates the shared graph,
  reconciles human tasks and handles revisions. It does not import `Shipment`.
- `AgentClient`, native HTTP and A2A exchange `BusinessCase` identity/revision plus the domain
  payload. Transport validation preserves payload fields; the receiving runtime applies the
  full domain schema before storage. The existing logistics API still returns `shipment` to its UI.
- Domain instructions, facts, roles, reference data, tools and special evaluators remain domain-owned.
  The existing app/CLI entry points still compose logistics. A second domain will add its materials
  and necessary domain logic plus small assembly/launcher wiring, not another engine or service stack.

`packages/agent-transport/src/domain-agent.test.ts` exercises an arbitrary record domain through
the same runtime, SQLite waiting/recovery and native/A2A adapters. This is a contract test, not
an insurance migration result or cost benchmark.

## Folder and code distribution strategy

| Location | Responsibility |
|---|---|
| `apps/` | Process entry points and composition: agent host, coordinator API and web console; business-specific wiring stays here rather than inside the shared engine |
| `packages/` | Existing reusable boundaries: contracts, pure rule evaluation, case runtime, human tasks, investigation harness, transport, models and storage/service support; `logistics` supplies domain facts, vocabulary, evaluators and tools |
| `tools/` | Launcher and reviewed rule-authoring workflow; not another runtime or a second implementation of the engine |
| `eval/` | Protected business materials and labels, plus executable replay/fault/experiment runners; generated reports go to ignored `var/reports/` |
| `scripts/` | Repository maintenance and engineering checks, not business logic |
| `docs/` | User-facing architecture, operation, demo and evidence descriptions |
| `.harness/` | Shared delivery-agent decisions, roadmap and handoff; not the runtime harness (`packages/agent-harness`) |
| `.agents/skills/`, `.claude/skills/` | Read/use-only delivery tools, excluded from project source gates |

Packages depend inward and import other packages only through their named public entries. Tests
sit beside their owners; native/A2A adapters share request validation instead of duplicating it.
Common controls and component-owned styles remain together in `apps/web/src/styles.css`, using
existing tokens. No new package, dependency or folder hierarchy is required by this quality repair.

This distribution is suitable for an experimental baseline because the reusable execution path
can be distinguished from logistics assembly, exercised independently, and compared against a
fixed source/material/environment reference. It does not prove that insurance will require no
shared-code changes: the complete later migration diff and effort must still be measured.

## Durable ownership

| State | Authoritative owner | Resume behavior |
|---|---|---|
| Case revisions, rule outcomes, human tasks, business events | CaseStore SQLite and the deterministic runtime/task state machine | Reload domain-validated data and re-evaluate unresolved work; reuse valid fingerprints |
| Investigation conversation and completed tool steps | Pi Durable through the generic investigator harness | Resume the same conversation/checkpoints; domain tools must make side effects replay-safe |
| Business proposal, confirmation and reservation | Domain stores/transactions and operation identifiers | Reconcile the proposal with the current revision; deterministic checks and humans retain authority |
| A2A request receipts and task envelopes | Transport memory | Deduplicate completed requests within the running process; reset clears affected receipts; not a durable business-state store |

The concept is one domain agent combining these capabilities, not two owners for the same workflow
transition. Whole-business-flow Pi Durable scheduling is not claimed; a separate spike proves
feasibility, while the current business runtime uses project SQLite persistence.

## Technical acceptance evidence

- Full quality gate: 157 tests, zero clones across 154 production TS/TSX/CSS/JavaScript files,
  strict types, boundaries, materials lock and unused-code checks. The duplication gate enforces
  0% at a 50-token minimum; tests, generated files and installed skills are excluded.
- Concurrent completion and conflicting approval/rejection tests preserve the first accepted
  task result. The runtime re-reads task state inside its per-case process-local queue.
- Native and A2A tests reject malformed outcomes and decisions before calling the business client,
  including missing actors/evidence fields, invalid statuses and remote carry-forward attempts.
- Eight scripted logistics replays; 17 passing fault scenarios, with F06 not applicable (polling, no SSE).
- Twenty-six screening samples with no missed rules; S14 selects three extras. These are development data.
- Eight initial case snapshots match the pre-cleanup reference, including outcomes, fingerprints
  and human task identifiers; only the internal record field names need normalization for comparison.
- SQLite stores created by checkpoint `0265a05` reopen and resume unchanged for all eight cases.
- Browser interaction checks and 16 light/dark accessibility scans pass; layout geometry is unchanged.
- Real HTTP runs in both native and A2A mode complete LOG-001 and LOG-004 (investigation, reroute,
  reapproval and dispatch), then reset successfully. All 150 final LOG-004 rule states/fingerprints match.
- The scripted authoring CLI validates its recorded Schedule G proposal; it is not applied.

The A2A reset exercise exposed stale completed-request receipts after business data was cleared.
The baseline ties receipt invalidation to native reset and the coordinator's reset assembly;
normal request retries still deduplicate. Regression tests cover reset/resubmit through both transports.

The accepted implementation passed both Linux and Windows
[CI jobs](https://github.com/ClydeShen/durable-jev/actions/runs/40067411538).
The committed acceptance record is [baseline-manifest.json](baseline-manifest.json).
Detailed local evidence under `var/reports/` and `/tmp/durable-jev-*` is not part of a fresh clone
or independent blind evidence; reproduce the automated gates using the commands below.

## Recovery and future work

Keep both recovery refs unchanged by convention; no repository protection rule is claimed.
Restore into a separate directory, without overwriting an existing working tree:

```sh
git clone --branch baseline-2026-10-24-r2 https://github.com/ClydeShen/durable-jev.git durable-jev-baseline
cd durable-jev-baseline
pnpm bootstrap
pnpm check
pnpm replay
pnpm faults
pnpm start
```

Use the pinned toolchain below; the default scripted console is http://localhost:4100.
The archive contains tracked source, materials, engineering configuration and handoff records,
not credentials, installed dependencies, temporary evidence or the current local database.
The demo initializes from committed materials. Resolve the exact archive commit with
`git rev-parse baseline-2026-10-24-r2^{commit}`.

Future experiments start on a new branch from `baseline-2026-10-24-r2`, not on any backup branch.
Use that tag for migration diffs and count additional shared-core, domain, material and wiring
work after this freeze. No policy-change or insurance experiment is initiated by archiving it.

## Freeze record and limits

Toolchain: Node 26.12.1, pnpm 12.15.0, TypeScript 6.0.3, ES2025. All acceptance execution is scripted;
no live model calls are part of this cleanup. Delivery-agent skills are unchanged and not project source.

SHA-256 references (current LF checkout):

- `eval/materials.lock.json`: `e2e634157a813a7b23a9a162294f6ad18227735b828062188a564b16d8ed376d`
- `pnpm-lock.yaml`: `c0f075670191d70444917f4aba2e345366cf79c19a370605494900335b43d023`

The owner confirmed this baseline after reviewing the functional and structural acceptance.
Do not move any baseline or demo recovery refs, silently reset the experimental baseline after
seeing costs, or present cleanup as measured policy/domain adaptation effort.

Remaining limits are research findings, not an automatic product backlog: simulated materials,
unreviewed labels, no blind set or measured authoring savings yet, logistics-only UI/composition,
three-step approval-chain limit, in-memory A2A receipts, and the investigator's restart/budget limits.
Human-gate applicability/parameter edits still require explicit rule-version discipline: the P1
parameter-only stale-task observation remains; a version bump can conservatively request extra
approvals. Measure both old-policy retention and new-policy re-evaluation after freeze.

Legacy logistics scope payloads and SQL column names remain compatibility boundaries so old
tasks and databases work without migration. New named scopes use `kind` plus optional `entityId`.
Neither compatibility nor the record contract fixture establishes full industry independence.

After freeze: logistics policy changes and reviewed authoring comparisons first, then bounded motor
insurance claims; logistics vehicle insurance over A2A is the optional final bonus. See
[evaluation-plan.md](evaluation-plan.md) and `.harness/roadmap.md`.
