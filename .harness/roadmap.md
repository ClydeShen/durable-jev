# Roadmap

Status: `[ ]` not started, `[~]` in progress, `[x]` done, `[-]` cancelled (reason in
implementation-notes).

Every phase ends with something to demonstrate. The end of P2 gives an end-to-end slice.

## Current execution order (owner decision, 2026-10-24)

Preserve the demo checkpoint → document the plan → tidy the shared core without breaking the
demo → freeze the experimental baseline → measure logistics policy changes → measure motor
insurance adaptation → optional cross-domain A2A demonstration. See P8 below and the current
handoff in `implementation-notes.md`. Historical P0-P7 completion marks are retained; they are
not blanket claims that domain independence or module-wide Pi Durable integration is complete.

## P0 Skeleton and technical spikes (PRD M0)

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T0.1 | Monorepo skeleton: pnpm workspace, tsconfig base, Biome, Vitest, `.gitignore`, `.env.example` | `pnpm install && pnpm build && pnpm test` pass on empty packages | |
| [x] | T0.2 | Root scripts `bootstrap/start/test` as placeholders; `README.md` points to `docs/getting-started.md` | The commands run | T0.1 |
| [x] | T0.3 | Spike pi-durable: a read-only tool and a write tool, recovery after killing the process; observe the replay policy, callers, requestId, restartLimit | The script reproduces it; findings in m0-findings | T0.1 |
| [x] | T0.4 | Spike A2A: Agent Card, sending a task, querying a task, input-required | A round trip between two processes works | T0.1 |
| [x] | T0.5 | Spike Jev: settle the TS client or HTTP interface; one Choice and one Noul | Real calls with a key; the interface shape recorded without one | T0.1 |
| [x] | T0.6 | Spike trace: traceparent propagation between two Express services | The downstream log carries the upstream traceId | T0.1 |
| [x] | T0.8 | Spike: Pi Durable carries a module-level flow (deterministic rule evaluation + waiting for a person + recovery after a kill) without an LLM choosing the next step | Feasible or clearly not, with findings in m0-findings and the design updated | T0.3 |
| [x] | T0.7 | `docs/m0-findings.md` + pinned versions + design updated | Per dependency: version, feasibility, limits, effect on the design | T0.3–T0.6 |

## P1 Deterministic core

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T1.1 | `contracts`: ids, status enums, shipment, check, humanTask | Types and Zod schemas are exported | T0.1 |
| [x] | T1.2 | `rule-engine` expressions and combinators (design 5.3) | Combinator tests: UNKNOWN never becomes PASS through OR/NOT, an empty set is UNKNOWN | T1.1 |
| [x] | T1.3 | Validation: missing references, types, cycles, missing parameters, contradictions in the mixing matrix; applicability fields (destination, cargo category, customer) | F16 tests | T1.2 |
| [x] | T1.4 | Graph evaluation: scope expansion (cargoItem/leg), blockedBy, appliesWhen | One failing item stops the whole order (F17) | T1.2 |
| [x] | T1.5 | Fingerprints, invalidation propagation, incremental evaluation | Changing the vehicle invalidates only the expected set | T1.4 |
| [x] | T1.6 | `store`: SQLite connection, migrations, idempotent operations table, outbox | The same operationId run twice writes once | T0.1 |
| [x] | T1.7 | Human task state machine (a package shared by the modules): approve/reject/complete/expire/cancel/supersede, role checks, revision binding; approval chains of 2–3 roles (sequential/parallel, four eyes, conditional steps) | Unauthorised, expired and old-revision decisions have no effect (F11, F12); any rejection in a chain is FAIL, one person cannot sign two steps | T1.1 |

## P2 Slice: LOG-001 end to end

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T2.1 | `eval/materials`: policy parameters, rules.json with the rules LOG-001 needs | Passes validation | T1.3 |
| [x] | T2.2 | Mock data seed: carriers, vehicles, customer credit, the LOG-001 order | `demo:reset` loads it | T1.6 |
| [x] | T2.3 | `coordinator`: submit, evaluate, query checks, human tasks, release transaction (one process for the slice; human tasks move into the modules in T3.2) | The API runs LOG-001 | T1.4–T1.7, T2.1 |
| [x] | T2.4 | `service-kit` + `tools/launcher`: `pnpm start`, `pnpm demo:reset` | One command starts every process | T2.3 |
| [x] | T2.5 | Minimal `web`: case list, rule graph (shared graph component, design 9.1 inner view; status, blockedBy), human tasks by role, dispatch confirmation | LOG-001 is dispatched in the browser | T2.3 |
| [x] | T2.6 | `docs/getting-started.md` | A new environment can demo by following it | T2.4, T2.5 |

## P3 Full rules and business services

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T3.0 | Rule-authoring agent: `policy-v1.md` → rule graph configuration, structured expressions, Jev questions; outputs a diff for human review | It generates LOG-001's rules from the policy text, matching the hand-written T2.1 version | T1.3, T4.2 |
| [~] | T3.1 | Complete R09–R28, R33–R36 and the decision tables (mixing matrix, hub capability) with the authoring agent, reviewed by a person | All 40 rules pass validation; generation and review time and the amount of human editing recorded | T2.1, T3.0 |
| [x] | T3.2 | Split out three Durable Jev Agents, cargo assurance, transport planning and commercial control (design 2), each owning its rule graph and human tasks, with a native HTTP task interface and `GET /agent/summary` | Each has its own SQLite; the launcher starts them | T2.4 |
| [~] | T3.2a | Peer collaboration between agents (with the T4.6 helper and T5.1 A2A): transport → commercial (R35 extra cost approval), transport → cargo (R28 candidate plan re-check), a carrier change telling cargo to invalidate the R13 approval chain | All three exchanges appear in LOG-004 (transport → commercial and transport → cargo appear through r2's propagation; the planner confirms in the transport agent) | T3.2 |
| [x] | T3.3 | The coordinator schedules branches in parallel; branches without a dependency go on while one waits for a person | The commercial branch finishes while compliance waits | T3.2 |
| [x] | T3.4 | Changes: a new vehicle, route or quote triggers invalidation, and the UI shows which change invalidated a result | LOG-004's invalidated set is as expected | T1.5, T3.3 |
| [x] | T3.5 | LOG-002–008 cases, event scripts, draft labels | The files are complete and marked `reviewStatus: draft` | T3.1 |
| [x] | T3.7 | Extension pack: `policy-v1.md` appendices (customer contract terms, destination import requirements modelled on the MPI IHS structure); the authoring agent generates 100–200 extension rules (`CUST-*`, `DEST-*`) under R27 and a new R41 (feeding R37); destinations and customers added to LOG-001–008; 20–30 screening samples (draft) | Extension rules pass validation; each order selects a few (appendices G/H: 108 extension rules + R41/R42/R43, validated and applied by the authoring tool; recorded as drafts, re-recorded with the real model in T7.0) | T3.0, T3.1 |
| [x] | T3.8 | Selecting applicable rules: Jev classifies the order (cargo category, destination requirement group) + an index fetches the rules; when unsure, select several or hand to a person | No missed rule on the screening samples; the UI shows "N not shown" (R42 multi-select classification by Jev + `RuleIndex` by destination, customer and commodity group; `pnpm screening` misses nothing on 26 samples (scripted answers; live in T7.0)) | T3.7, T4.2 |
| [x] | T3.6 | Replay runner (fixed-workflow baseline), asserting each stage | Stage assertions pass for all 8 demo orders | T3.5 |

## P4 Model adapters and the runtime harness

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T4.1 | `model-providers`: the SemanticJudge interface + ScriptedJudge | Replay is stable | T1.1 |
| [x] | T4.2 | JevJudge, StructuredOutputJudge (live mode) | With keys, both providers answer the same question | T0.5, T4.1 |
| [x] | T4.3 | Semantic rules R03, R10, R18, R27; observedValue kept apart from gateStatus | The semantic nodes of LOG-002 and LOG-003 are right | T4.1, T3.1 |
| [x] | T4.4 | `agent-harness`: interface, ToolRegistry, RunBudgetGuard, ContextAssembler | Budget and allow-list tests (implemented as: `DurableInvestigator` registers only read-only and idempotent-submit tools, a tool-call budget hook, `assembleInput` isolating the data) | T1.6 |
| [x] | T4.5 | InMemoryAgentRuntime + a scripted model | One investigation runs through (the scripted model runs directly on Pi Durable's in-memory store; no separate in-memory runtime) | T4.4 |
| [x] | T4.6 | The transport planning agent's investigation helper: find candidates, propose a reroute, submit the result | A reroute proposal for LOG-004, evaluated again after the planner confirms (three spare offers pre-checked against the rules; confirmed, it becomes r2) | T4.5, T3.4 |
| [x] | T4.7 | PiDurableAgentRuntime; extended to module-level flows as T0.8 found | The same investigation, and the same module waiting for a person, recover after a kill (a recovery test reopening the store in one process; killing processes is in the fault runner) | T0.8, T4.5 |
| [x] | T4.8 | `docs/runtime-controls.md`: each control linked to its evidence | Every row has a test or fault scenario | T4.4–T4.7 |

## P5 A2A, persistence and faults

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T5.1 | `a2a-adapter`: Agent Card, business task ↔ A2A Task map, a new linked task after a terminal state | Capability discovery and task queries (`agent-transport/src/a2a`: the Agent Card lists 5 business skills, one A2A Task per call; a retry with the same requestKey returns the first task's result; event pull and reset stay on the native operations interface) | T0.4, T3.2 |
| [x] | T5.2 | The coordinator switches between native and A2A calls | No business code changes on a switch (H4) (`pnpm start:a2a`; browser e2e of LOG-001 and LOG-004 give the same results in both modes) | T5.1 |
| [x] | T5.2a | Destination compliance agent: a fifth agent from the agent template, discovered through its Agent Card, with one more dependency on R40 | No code change in the other four agents; scripted as the extension demo (rule data + one launcher setting; the agent set follows from the rule owners; the overview shows the fifth agent) | T3.7, T5.1 |
| [x] | T5.3 | Fault runner: F01–F10 | `pnpm faults` writes a report (F01–F03 exit for real (137) in a child process and recover from the same file; F06 does not apply, as the console polls snapshots) | T4.7, T5.2 |
| [x] | T5.4 | F11–F18 | As above (F11–F18 in the same runner, all pass) | T5.3 |
| [~] | T5.5 | Demo controls in the web: kill and restart services, inject timeouts, repeat submissions | LOG-006 can be shown in the browser (F01–F03 exit for real (137) in a child process and recover from the same file; F06 does not apply, as the console polls snapshots) | T5.3 |

## P6 Observability and the console

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T6.1 | Event schema, each service's outbox, the collector | Events reach the observation store | T1.6 |
| [ ] | T6.2 | Trace propagation; a new trace after restart linked with a span link | Old and new traces of one case can be joined | T0.6, T6.1 |
| [~] | T6.3 | Console: case list, timeline, call tree, judgement details, recovery details | From a rule node to its Jev span / A2A Task / human evidence | T6.2 |
| [~] | T6.3a | Overview: agent-level graph (design 9.1), node cards with basics, A2A relations with a live overlay; a click opens the agent's own rule graph | The 5 agents' states on one screen; with a case selected, its A2A exchanges | T6.3, T5.2a |
| [ ] | T6.4 | SSE + snapshot cursor catch-up | A dropped connection and a refresh lose no events | T6.3 |

## P7 Benchmarks and conclusions

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T7.0 | Switch to live tuning: once the whole chain runs scripted, tune Jev's question wording, label descriptions, thresholds and the authoring agent's prompt on the development set; record measures before and after; the blind set takes no part | A tuning record; questions and threshold versions frozen before the blind test (3 rounds, see `docs/tuning-log.md`; CUST-MEDI-5 became a human step, live replay 8/8, screening misses nothing; the blind set is not built) | T3.6, T4.3, T3.8 |
| [ ] | T7.1 | B1 Jev vs structured output | Report macro-F1, cost, p95 | T4.2 |
| [ ] | T7.2 | B2 fixed workflow vs investigation helper | Completion rate, invalid call rate | T3.6, T4.6 |
| [x] | T7.3 | B3 in-memory vs Pi Durable | Recovery success rate, repeated side effects (F01–F03 exit for real (137) in a child process and recover from the same file; F06 does not apply, as the console polls snapshots) | T5.3 |
| [ ] | T7.4 | B4 native vs A2A | Overhead and swap test | T5.2 |
| [ ] | T7.6 | B7 Durable Jev Agent cost: share of hand-written code, share of rules carried by Jev and the authoring agent, time of a live policy change, cost per rule, selection accuracy and miss rate, Jev's share of the extension rules; with a map of the rule boundaries | Measured costs and all outcome categories reported, including wrong releases; zero wrong releases is a target, not a required finding | T3.1, T4.3, T8.4 |
| [x] | T7.7 | `docs/agent-architecture.md` (for a technical CEO) | Each section links to implementation and evidence (written on scripted evidence first; live measures added when available) | T5.2a, T6.3a |
| [~] | T7.5 | `docs/demo-guide.md`, `docs/report.md`: H1–H5 and the Durable Jev Agent conclusions, component recommendations | Every hypothesis has evidence (`docs/demo-guide.md` written; `docs/report.md` waits for the benchmarks) | T7.1–T7.4, T7.6 |
| [x] | T7.8 | Record the existing reuse boundary before generalization; reproducible schema probes and source hashes | `pnpm eval:portability` records fixed owners/scopes/roles/invalidation dimensions and discarded applicability keys; source audit and limits in `docs/evaluation-plan.md` (not migration or execution evidence) | T7.7 |
| [~] | T7.9 | Logistics policy-change protocol: reviewed mutations, direct-edit/authoring comparison, cost ledger and blind custody | P1 scripted characterization runs both activation modes and parameter-only/versioned variants (22 observations each); findings in `docs/evaluation-plan.md`. Policy review, authoring cost, independent blind evaluation and other change families remain unmeasured | T7.8 |

The first measured change experiment after baseline freeze is logistics policy adaptation. No
specific incumbent engine has been nominated. Motor insurance claims are the selected second
domain, to follow the logistics experiment with a bounded synthetic policy pack. Any synthetic
rewrite baseline remains to be agreed; neither experiment establishes enterprise migration cost.

The goal is evidence about durable-agent capabilities, development effort, suitability and limits,
not product delivery. Preserve failures as research findings; do not automatically turn coupling
or missing capabilities into a generalization or productionization backlog.

## P8 Baseline cleanup and domain experiments

These tasks define the new order, not another product milestone or a new package hierarchy.
Keep implementation slices small and preserve the current folder structure and code patterns.

| Status | ID | Task | Done when | Depends on |
|---|---|---|---|---|
| [x] | T8.0 | Preserve the runnable demo remotely | Backup branch and annotated tag resolve to `0265a05`; checks, replay, faults and browser checks passed; restore steps in `docs/demo-checkpoint.md` | |
| [x] | T8.1 | Align the handoff, scope, measurement boundary and working-branch plan | Decisions are committed on `baseline-cleanup-plan`, with backup refs and shelved-work warning | T8.0 |
| [~] | T8.2 | Extract the smallest shared rule/fact contracts | First slice moves selection/table vocabulary and extension applicability requirements to logistics constraints; indexing is dimension-agnostic, with 142 tests and logistics regressions passing. Fact contexts, scopes, roles and classifier coupling remain | T8.1 |
| [ ] | T8.3 | Align domain-agent runtime, durable ownership and A2A boundaries | Case handling and transport do not assume Shipment; checkpoint/resume/side-effect ownership is explicit and tested; no second engine or duplicated workflow state owner | T8.2 |
| [ ] | T8.4 | Freeze the experimental baseline | Full checks, replay, faults and runnable demo reviewed; owner confirms scope; commit, material hashes and environment recorded | T8.3 |
| [ ] | T8.5 | Run logistics policy-change experiments and authoring comparisons | T3.1/T7.6/T7.9 evidence from the frozen baseline; old-policy retention and re-evaluation scored and costed separately | T8.4 |
| [ ] | T8.6 | Run the bounded motor-insurance claims experiment | Domain materials and necessary special logic use the shared agent execution path; complete post-baseline diff, effort and limits reported | T8.5 |
| [ ] | T8.7 | Optional logistics vehicle-insurance collaboration over A2A | A bounded cross-domain task uses the same agent contracts without merging the two business models | T8.6 |

Pre-baseline cleanup is preparation, excluded from policy-change and domain-migration cost
measurements. Any further adaptation required after freeze is measured. Do not reset the baseline
after seeing a costly change to erase that cost.

Existing open work stays relevant: T3.2a/T7.2 distinguish actual agent decisions from fixed
orchestration; T7.1 and independent blind evaluation test judgment quality; T7.4 tests transport
overhead and interchangeability; T7.5 synthesizes findings. Recheck the actual Pi Durable coverage
behind T4.7/T7.3 instead of silently extending their historical completion claims. T6.2/T6.3/T6.3a
should expose evidence needed by the demo; T5.5 and T6.4 are lower priority unless that evidence
needs them. Do not expand the console or build SSE merely to close every old roadmap row.
