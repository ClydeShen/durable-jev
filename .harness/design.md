# Design

## 1. Tech stack

| Item | Choice |
|---|---|
| Runtime | Node 26, TypeScript strict, ESM |
| Package management | pnpm workspace, `saveExact: true`, lockfile committed, no Turborepo/Nx |
| Build | `tsc -b` (project references); Vite for the web |
| HTTP | Express 5 (the A2A SDK only offers an Express adapter) |
| Contracts and validation | Zod |
| Storage | better-sqlite3, one SQLite file per service under `var/data/` |
| Tests | Vitest |
| Logs | pino, JSON |
| Lint and format | Biome |
| Tracing | `@opentelemetry/api` + W3C traceparent, SDK settled in P0 |
| Front end | Vite + React, one page holding the console and the demo controls |
| External dependencies | `@earendil-works/pi-durable` 1.4.0, `@a2a-js/sdk` 1.3.0, `@typesafe-ai/sdk` 0.7.0 (model `jev-1.14.0`), OpenTelemetry API 1.10.0; see `docs/m0-findings.md` |

## 2. Folders

```
apps/
  coordinator/            Order coordination agent (R01, R02, R08, R37–R40, dispatcher confirmation) + orchestrator + gateway (API, static pages)
  agent/                  The generic Durable Jev Agent service, started by AGENT_ID as:
                            cargo-assurance     R03, R04, R09–R15, R17–R23; compliance, quality and warehouse tasks
                            transport-planning  R05–R07, R16, R24–R26, R29, R30; investigation helper, planner confirmation
                            commercial-control  R27, R31–R36 + CUST-* extension rules; commercial approvals
                            destination-compliance (extension demo) R41 + DEST-* extension rules
  web/                    Console and demo controls
packages/
  contracts/              Zod contracts: ids, shipment, check, humanTask, agents, order options
  rule-engine/            Pure functions: validation, combinators, evaluation, invalidation, the extension rule index
  store/                  SQLite connection, migrations, idempotent operations, outbox (the coordinator collects events into the observation store)
  model-providers/        The SemanticJudge interface: jev, structured-output, scripted
  agent-core/             Durable Jev Agent runtime: rule pack, case evaluation, human gates, AgentClient and CaseOrchestrator
  agent-transport/        Two transports for AgentClient: native/ (HTTP client and agent routes), a2a/ (Agent Card, business task ↔ A2A Task)
  human-tasks/            Human task state machine and approval chains
  logistics/              Reference data, case files, fact building, logistics agent assembly, release transaction, reroute investigation (reroute/)
  agent-harness/          Investigation helper runtime: DurableInvestigator on Pi Durable and its controls (tool budget, data isolation)
  service-kit/            Service boilerplate: Express, pino logs, health checks, demo role headers, error handling
tools/
  launcher/               One-command start; kill and restart processes by name (used by the demo controls)
  rule-authoring/         Rule-authoring agent: policy text → validated rule proposals and a diff
spikes/                   One-off P0 checks, not depended on by the product code
eval/
  materials/              policy-v1.md, rules.json, cases/, mock-data/, screening/, authoring/ (authoring recordings)
  blind/                  Blind-test answer keys, read only by the runner (to be built)
  runner/                 Replay (replay-main), screening (screening-main), fault scenarios (faults-main)
docs/                     User documents
var/                      Runtime data and logs, gitignored
```

Dependencies point inward: `apps → packages`; `rule-engine` and `contracts` depend on no IO package;
`agent-harness` depends on no specific business.

## 3. Engineering conventions

Each convention is enforced by a tool in `pnpm check`; rules, reasons and tools are in
[docs/engineering.md](../docs/engineering.md). Business-level additions:

- Names say what they mean in the business (`evaluateRuleGraph`, `invalidateDependentsOf`), no
  abbreviations; comments say only why and what constrains.
- Light tests: a few Vitest cases on the key semantics of each package, no coverage target.
- Every time is UTC, money in integer cents, weight in grams, temperature in integer tenths of a
  degree Celsius.
- Everything in the code base is English; only `docs/demo-guide.md` is Chinese.

## 4. One-command experience

| Command | What it does |
|---|---|
| `pnpm bootstrap` | install + build everything |
| `pnpm start` / `pnpm start:a2a` | The launcher starts the 5 agent services + web (the latter over A2A), announces the address and opens the browser |
| `pnpm demo:reset` | Clear the stores and load LOG-001 to LOG-008 |
| `pnpm check` | Lint, full type check (tests and web included), knip, unit tests |
| `pnpm replay` / `pnpm screening` / `pnpm faults` | Replay, screening, fault scenarios; reports in `var/reports/` |
| `pnpm bench` | Run the benchmarks (to be built) |

`.env.example` offers `MODEL_MODE=scripted|live`, `TYPESAFE_API_KEY`, `NVIDIA_API_KEY`. The
default is `scripted`, so the demo runs fully without keys.

Demo controls in the web (local demo mode only): pick a case, act as a role, approve or do field
work, place a new order, change an order to trigger invalidation, reset one case, kill and restart
services.

## 5. Rule engine semantics

### 5.1 Statuses

`PASS | FAIL | UNKNOWN | NOT_APPLICABLE | ERROR | BLOCKED_DEPENDENCY | WAITING_HUMAN | INVALIDATED`

Each check keeps both its `observedValue` (a fact, such as "an excursion exists") and its
`gateStatus` (the gate's conclusion); the two are never mixed.

### 5.2 Rule definition

```ts
type RuleDefinition = {
  ruleId: string
  version: string
  scope: 'order' | 'cargoItem' | 'leg'
  appliesWhen?: Expression
  dependsOn: string[]
  evaluator: { kind: 'code' | 'decisionTable' | 'semantic' | 'humanGate' | 'combinator'; ref: string }
  combiner?: Expression
  unknownPolicy: 'block' | 'escalateToHuman'
  inputPaths: string[]
  humanGate?: {
    taskType: 'APPROVAL' | 'OPERATION'
    steps: { requiredRole: Role; appliesWhen?: Expression }[]   // 1–3 roles
    mode: 'sequential' | 'parallel'
    distinctActors: boolean                                      // four eyes: one person cannot sign two steps
  }
  invalidationTriggers: string[]
}
```

Leaf evaluation:

| kind | Configuration | Run by | Written by |
|---|---|---|---|
| `expression` | `expression.passWhen` (FEEL; true/false/null → PASS/FAIL/UNKNOWN), optional `observe` | Built into rule-engine | The authoring agent, reviewed by a person |
| `semantic` | `semantic`: the question (choice / noul), `state` (FEEL values), `passWhen` (choiceIn / probabilityAtLeast / probabilityAtMost / selectChoicesAtLeast) | The agent layer, with a SemanticJudge (Jev) | The authoring agent |
| `humanGate` | `humanGate`: steps, mode, four eyes, `evidenceRequirements`, `expiresAfterHours` | The agent layer, with the human task state machine | The authoring agent |
| `combinator` | A `combiner` expression tree | Built into rule-engine | The authoring agent |
| `code` / `decisionTable` | `evaluator.ref` names a registered function | Hand-written code registered in the agent layer | A person; counts towards "hand-written code" |

FEEL context: `order`, `cargoItems`, `legs`, the current member `item` or `leg`, `params` (policy
parameters). The FEEL filter syntax `list[condition]` is not used (feelin 8.2 returns an empty
list in these cases, which makes `every` vacuously true); write
`every i in list satisfies (not(applies) or condition)` instead. Condition trees can use a `feel`
leaf for a numeric or factual condition; `allOf`/`anyOf` work in any scope as long as they are not
nested within the same scope (a leg rule may read "any item is controlled"). `decisionTable` is
currently the mixing matrix: two FEEL values `mixing.categories` / `mixing.qualifications` decided
by the rule pack's `mixingMatrix`, with the offending mixes as the observed value. Any `params.X`
in an expression must be declared in the rule's `parameters` and exist among the policy
parameters; FEEL syntax is checked at start-up validation.

`Expression` is a JSON tree of `and | or | not | ifThen | allOf(scope) | anyOf(scope) | ref(ruleId)`
told apart by `op`; `ifThen` uses `condition` / `consequence` fields (so `then` is not taken for a
thenable). There are two more leaves: `fact(path, equals|includes)` reads an input fact (an
`order.` prefix reads the order, otherwise the current scope member), and
`observed(ruleId, equals|includes)` reads an upstream rule's observedValue (such as the branch R04
chose); a missing value is UNKNOWN.

### 5.3 Combinator semantics

Non-terminal statuses are called pending: `UNKNOWN | BLOCKED_DEPENDENCY | WAITING_HUMAN | INVALIDATED`.

| Combinator | Rule |
|---|---|
| `and` | Any FAIL → FAIL; else any ERROR → ERROR; else any pending → the first pending; else all PASS → PASS. NOT_APPLICABLE children are ignored; empty after that → NOT_APPLICABLE |
| `or` | Any PASS → PASS; else any pending/ERROR → that status; all FAIL → FAIL |
| `not` | PASS ↔ FAIL, everything else unchanged (UNKNOWN cannot become PASS) |
| `ifThen(c, t)` | c is FAIL/NOT_APPLICABLE → NOT_APPLICABLE; c is PASS → t; c is pending → BLOCKED_DEPENDENCY |
| `allOf(scope, e)` | An empty set → UNKNOWN (never passes by default); otherwise `and` over the members |
| `anyOf(scope, e)` | An empty set → UNKNOWN; otherwise `or` over the members |

A rule whose dependencies are not done is itself BLOCKED_DEPENDENCY and records `blockedBy`.

Graph evaluation (`evaluateRuleGraph`) runs in topological order, one instance per scope member:

1. `appliesWhen`: FAIL/NOT_APPLICABLE → the rule is NOT_APPLICABLE; pending →
   BLOCKED_DEPENDENCY; ERROR → ERROR.
2. A combined rule evaluates its `combiner` directly, without dependency gating (the combinator
   semantics handle pending).
3. A leaf rule: every dependency in `dependsOn`, apart from those `appliesWhen` already references,
   must be PASS or NOT_APPLICABLE, otherwise BLOCKED_DEPENDENCY with those dependencies in
   `blockedBy`; an order-level rule that depends on item or leg rules aggregates them with ALL (an
   empty set is UNKNOWN). A rule like R33 ("only when R32 fails") puts R32 into `appliesWhen`, so
   R32's FAIL does not gate it.
4. An evaluator that throws → ERROR; a missing evaluator → ERROR; UNKNOWN with
   `unknownPolicy = escalateToHuman` → recorded in `escalations`, and the human task module (T1.7)
   creates a task.

### 5.4 Validation

At start-up: references exist, expression types, no cycles (topological sort), parameters exist in
the policy parameters. On failure the service refuses to start a release.

### 5.5 Invalidation and incremental evaluation

- Each check records `inputFingerprint = hash(values of inputPaths + entity versions + upstream
  result ids)`.
- An entity change → `invalidationTriggers` find the directly affected rules → propagated
  downstream along the dependency graph → marked INVALIDATED → only these are evaluated again.
- A human task is bound to its target revision and `inputFingerprint`. When the fingerprint
  changes the task is cancelled and a new one, linked by `supersededBy`, is opened; when only the
  revision moves on and the rule's inputs did not change, the open task is carried to the new
  revision (`carryForward`) and stays valid.
- Multi-role approval chains: each step is its own APPROVAL task (one role, with the
  `approvalChain` chainId/stepIndex/stepCount/mode). In sequential mode the next step opens once
  the previous one is approved; in parallel mode they open together. All approved → the gate
  PASSes; any rejection → FAIL and the other steps are cancelled; any expiry → the chain lapses
  and is started again; on invalidation the whole chain is replaced by a new one. With
  `distinctActors` one person cannot approve two steps of a chain, and two steps of the same role
  make a "two-person review". Steps may carry `appliesWhen` (a compliance reviewer added for
  controlled goods, a second commercial manager above the second credit tier). In Pi Durable a
  chain is a parent task waiting on its subtasks in turn. Implemented in `packages/human-tasks`:
  `decideHumanTask` checks role, expiry, target revision (fingerprint), evidence fields, step order
  and four eyes before anything is final; `chainOutcome` / `stepsToOpen` / `gateStatusOf` compute
  the chain's state, which steps to open and the gate status. When a chain expires or is cancelled
  or replaced, the gate is UNKNOWN and the owning agent starts a new chain.
- A late result whose fingerprint no longer matches is only archived.
- Implementation: when an order is revised, CaseRuntime compares the entity versions of the old and
  new facts to find the change (such as `r2 (route, carrier, quote)`), `invalidateDependentsOf`
  finds the affected rules, a `result.invalidated` event is written, and re-evaluated results carry
  `invalidatedBy` so the UI can show which change invalidated them; a document's version is a short
  hash of the document and warehouse record contents and changes only when the content does;
  `evaluateRuleGraph(..., { previous })` reuses code / decisionTable / semantic results whose
  fingerprint is unchanged (Jev is not called again), while human gates and combined rules are
  evaluated every time. Entity versions are order-level, so changing one leg evaluates every leg
  under the same trigger again: conservative, never a wrong reuse.

## 6. Services and flow

- Terms: "agent" means only a Durable Jev Agent (an A2A identity outside + Jev + Pi Durable + a rule
  pack inside). An LLM loop that chooses its own tools is the "investigation helper", an optional
  part inside an agent.
- Collaboration (all over A2A): dispatch and aggregation (order coordination ↔ each agent, one A2A
  Task per "order revision × capability"); peer requests (transport → commercial: extra cost
  approval R35 for a reroute; transport → cargo: cold-chain and controlled re-check of a candidate
  plan R28/R16/R26); change notification and invalidation (a carrier change → the cargo agent's R13
  approval chain is invalidated and reissued); people and missing data are always
  `input-required`. Agents share no database and call none of each other's internal code; their
  only contract is the Agent Card and the business result contracts in `contracts`.
- Extension: a new agent starts from the same template (service-kit + rule pack + Agent Card), the
  order coordination agent discovers it through its Agent Card, and R40 gains one dependency;
  existing agents change no code. Agents are split by business responsibility, approvers, release
  cadence and data ownership, not by rule count.
- Each business module is a Durable Jev Agent (spec 8): it owns its rule graph, leaf evaluation,
  human tasks and waiting state, and recovers through Pi Durable after waiting for a person or a
  process restart.
- A module flow is a Pi Durable durable task (no LLM): checkpointed stages, human approval as a
  subtask plus a decision document; see `docs/m0-findings.md` T0.8.
- Leaf evaluators: structured rules have `evaluator.kind = code | decisionTable`, unstructured
  rules `semantic` (Jev). One rule can have both for comparison (B7).
- The coordinator owns the order revisions and the order-level aggregation (R08, R37–R40), and gets
  the modules' results over A2A or the native interface; dependency scheduling is a deterministic
  state machine.
- Propagation across agents: every agent loads the whole rule pack and runs only the rules it owns;
  other agents' results come from the orchestrator (unreported means UNKNOWN). Each round
  `CaseOrchestrator` hands every agent the others' latest results to evaluate in parallel, until no
  status or fingerprint changes (the graph has no cycles, so the rounds stay within its depth; the
  limit is 12). A human decision is routed by the rule in its task id to the owning agent, which
  then triggers propagation. The orchestrator depends only on the `AgentClient` interface: an
  in-process implementation for the replay runner, an HTTP one at run time, and an A2A one from P5.
- Business services expose a native HTTP task interface; `agent-transport`'s a2a/ wraps an A2A
  server around it (the B4 comparison).
- Human tasks are owned by their module (reusing the state machine in `packages`); waiting across
  modules is A2A `input-required`. The web gathers the modules' task queues. Role identity is
  simulated by the `x-demo-role` header, and the server checks permissions.
- Release: when the dispatcher confirms, the current revision is read again and R40 evaluated
  again in one SQLite transaction; only a pass writes DISPATCHED.

## 7. Runtime harness

### 7.1 Interface

```ts
interface AgentRuntime {
  open(sessionKey: SessionKey): Promise<AgentSession>
}
interface AgentSession {
  submit(request: { requestId: string; input: InvestigationInput }): Promise<RunHandle>
  resume(): Promise<void>
  events(): AsyncIterable<AgentEvent>
  close(): Promise<void>
}
type ToolDefinition = {
  name: string
  access: 'read' | 'write'
  replayPolicy: 'replaySafe' | 'verifyByOperationId'
  allowedCallers: ('agent' | 'system')[]
  inputSchema: ZodType
  execute(input, context: ToolContext): Promise<ToolResult>
}
```

Implementations: `InMemoryAgentRuntime` (B3 group A), `PiDurableAgentRuntime` (group B).

### 7.2 Controls

| Control | Where |
|---|---|
| Tool allow-list and caller limits | `ToolRegistry`, per service; approvals, field actions, applying a plan and dispatch are never registered with the agent |
| Budgets | `RunBudgetGuard`: 10 tool calls, 3 model retries, 2 rounds of automatic data requests, 30 s target, 60 s hard stop |
| Idempotent writes | `ToolContext.operationIdFor(logicalActionId)` generated on the server; unique constraints in the business store |
| No replayed side effects after a crash | `replayPolicy=verifyByOperationId`: on recovery check `get_operation_status` first |
| Isolated input channels | `ContextAssembler`: policy and system instructions kept apart from document text, which is data only |
| Output has no authority | The agent can only `submit_investigation_result`; the rule engine and human gates decide |
| Revision binding | Results carry `caseRevision` and a fingerprint, checked on submit |
| Loops and repeated crashes | Budget guard + restart limit; beyond it, hand to a person |
| Traceability | Every run, tool and model call emits an `observability` event |

Each row has an evidence test or fault scenario in `docs/runtime-controls.md`.

## 8. Model adapters

```ts
interface SemanticJudge {
  ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer>
}
```

Implementations: `JevJudge` (official SDK, `jev-1.14.0`), `StructuredOutputJudge` (pi-ai NVIDIA
`nemotron-3.5-lightning-30b-a3b`, forced to call the `submit_answer` tool and validated against the
schema), `ScriptedJudge` (replays by questionId + input hash, falling back to the question's
default entry). All three turn off their SDK's own retries; the harness retries. A
`SemanticAnswer` keeps the provider's raw fields and the business mapping.

## 9. Observability

### 9.1 Two-level graph views (console)

One graph component (`@xyflow/react` 12 + `elkjs` 0.12 layered layout) serves both levels with
the same interactions: click a node for its summary or card, open an agent's own rules, return.

| Level | Nodes | Edges | Node card (no inner detail) |
|---|---|---|---|
| Overview (agents) | Each Durable Jev Agent | Collaboration: the dependencies between their rules, with live A2A task counts | Name, the business it owns, health (running / restarting / offline), rule pack version and rule counts (code / Jev share), pinned model version, cases in progress, open human tasks by role, Agent Card link |
| Inside an agent (rules) | Rules, human gates (approval chains included), boundary nodes for other agents' rules | `dependsOn` | Rule id and title, how it is evaluated (code / Jev / human), status in the selected case and blockedBy |
| Node details | — | — | Rule results, Jev's raw answer and mapping, approval chain progress, evidence (the T6.3 judgement details) |

- With a case selected, both levels are coloured by that case: the overview shows its state in each
  agent, the inner view the rule statuses. Without a case, the overview shows the architecture and
  totals.
- Data: Agent Cards (static), each agent's `GET /agent/summary` (from service-kit, with
  `AgentSummary` in `contracts`), the rule pack (inner graph), the observation store (A2A tasks,
  events).

- Events go to each service's outbox table; the coordinator's collector gathers them into
  `var/data/observability.sqlite`; the console reads them through the query API by polling
  snapshots.
- Identifiers follow PRD 15.2; `traceparent` propagates over HTTP between services.
- Business correctness does not depend on the observation store.
