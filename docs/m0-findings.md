# M0 spike findings

Every spike can be reproduced in this repository. The findings hold for the pinned versions only.

## Pi Durable 1.3.0

Reproduce: `pnpm --filter @durable-jev/spike-pi-durable crash-recovery` (scripted model, no key
needed)

Scenario: an investigation agent calls a read-only tool `get_vehicle`, a human-only tool
`approve_compliance` and a write tool `reserve_transport` in turn. The process is killed after the
write tool has stored to the business ledger but before its result is committed (as in F02), then
restarted.

| Check | Result |
|---|---|
| The same task resumes after restart | Passes. The same `requestId` returns the same submission and continues from the checkpoint to completion |
| Completed read-only tools are not run again | Passes. Their results are read from storage |
| Write tools are not replayed | Passes. A tool not declared `replay: "safe"` gets an `interrupted` error after the restart and does not run again |
| Handling an uncertain state | Passes. On `interrupted` the model calls `get_operation_status`, which confirms it took effect; the ledger holds one entry |
| Human-only tools are blocked | Passes. A `beforeTool` hook returns block and the model gets a `blocked` error result |
| Usage is recorded | Passes. `harness.usage()` totals by provider and model, failed attempts included |
| Runs without a key | Passes. pi-ai ships a faux provider whose responses can be scripted |

Not yet verified: `callers` / `modelTools` hiding tools from the model, and `restartLimit` guarding
against crash loops.

### What it means for the design

- `replayPolicy: verifyByOperationId` maps directly onto Pi's default (not replay-safe) behaviour,
  together with `get_operation_status` on the business side.
- Pi's `requestId` makes only the submission idempotent; business side effects stay idempotent
  through our operation ids and the business database's unique constraints.
- Human-only tools are best not registered with the agent at all; the hook is the second line of
  defence.
- The faux provider can serve as the base of `ScriptedJudge` and the scripted investigation model.

### Limits

- The API is marked Experimental; the version is pinned at 1.3.0.
- One store is owned by one process; there is no cross-process lock.
- The SQLite store relies on Node's built-in `node:sqlite` (an ExperimentalWarning is printed at run
  time).
- A power or host failure may lose the latest commit (`synchronous = NORMAL`), consistent with the
  PRD promising recovery from process crashes only.

### Module-level flow (T0.8, Durable Jev Agent)

Reproduce: `pnpm --filter @durable-jev/spike-pi-durable module-flow` (R18 uses the real Jev when
`TYPESAFE_API_KEY` is set, otherwise it is scripted)

Scenario: the cargo module's flow, without an LLM, runs as a Pi Durable durable task (`defineTask`,
checkpointed in stages): code rule R02 → Jev rule R18 → create the compliance approval subtask R13
and wait → kill the process → restart → kill again → after the restart a person approves →
evaluate R14.

| Check | Result |
|---|---|
| A durable flow without an LLM | Passes. `defineTask` with an empty `createModels()` provider is enough; the flow logic is all code |
| Completed rules are not evaluated again | Passes. After two crashes R02 and R18 each ran once (Jev was called once); results came from the checkpoint |
| Waiting for a person across restarts | Passes. The parent task stays `waiting` on the approval subtask; after the restart the subtask listens to the decision document again |
| The human decision arrives | Passes. A `harness.commit` from outside writes the session document; the subtask's `watchDoc` sees it and ends, and the parent moves on to its `decide` stage |
| Approval expiry | Supported by design (in the subtask, `runtime.sleep(expiresAt)` races the decision); not tested in this run |

Points to note:

- `watchDoc` does not create the document. The decision document must be created with `tx.doc()`
  in the same commit that starts the approval, or the watch is empty and the task waits forever.
- **After a restart, `Harness.waitForTask` returns a non-terminal record at once for a task that is
  `waiting`** (its type says terminal). The task is not yet in the scheduler's in-memory live set,
  so storage is read directly. Callers must check `state.status` and retry, or use
  `watchTaskGraph`.
- A stage that crashes before its checkpoint is committed runs again in full; a Jev call may be
  billed twice (as FR-17 allows), and steps with side effects still need operation-id idempotency.
- Once a subtask ends its record is collected and `getTask` returns `undefined`; its result can only
  be read through the parent's `outcomes()`.

### What it means for the design (module level)

- A Durable Jev Agent's module flow can be built directly on Pi Durable's durable tasks, with rule
  evaluation still deterministic code; the investigation agent is another conversation in the same
  harness, enabled when needed.
- A human task is a durable subtask plus a decision document; the business-side human task state
  machine (T1.7) checks role, revision and expiry, and only then writes the decision document.
- Scheduling the order's rule graph could map onto the parent task's stages and `waiting on`
  subtasks, but `rule-engine` still computes the rule graph; Pi Durable only persists and wakes.

## A2A SDK `@a2a-js/sdk` 1.3.0 (protocol v1.0)

Reproduce: `pnpm --filter @durable-jev/spike-a2a round-trip`

Scenario: cargo assurance exposes its capabilities over A2A JSON-RPC; a client discovers the Agent
Card, starts a check, gets input-required, supplies the missing data and receives a structured
Artifact.

| Check | Result |
|---|---|
| Capability discovery | Passes. `ClientFactory.createFromUrl` reads `/.well-known/agent-card.json` |
| Task lookup | Passes. `getTask` returns the same task's state |
| Asking for missing data | Passes. `INPUT_REQUIRED` carries the missing fields; a follow-up message with the original taskId moves the task to `COMPLETED` |
| Structured business result | Passes. The business checks go into the Artifact as a data part |
| Deduplicating repeated requests (F04) | **Not provided.** Resending the same `messageId` creates a new task and runs it again |

### What it means for the design

- For F04 the project keeps a `(caseId, revision, capability) → a2aTaskId` map in its A2A adapter
  (now `packages/agent-transport/src/a2a`) and returns the original task on a retry.
- The SDK's server side offers only an Express adapter (and gRPC). The services use Express 5
  throughout, not Fastify.
- An AgentInterface must declare `protocolVersion: '1.0'`, or the server refuses every request.
- The default `InMemoryTaskStore` loses everything on restart; the SDK has a Kysely-based
  `DatabaseTaskStore` (SQLite works); T5.1 decides whether to use it.

## Jev `@typesafe-ai/sdk` 0.7.0

Reproduce: `pnpm --filter @durable-jev/spike-jev semantic-checks`. Without `TYPESAFE_API_KEY` it
runs in recorded mode (an injected `fetch` returns recorded responses); with the key it calls the
real service.

Scenario: one request asks R18 (risk signals in the inspection note, Choice) and R10 (does the
safety data sheet match the declaration, Noul) together.

| Check | Result |
|---|---|
| Official TS SDK | Yes: `@typesafe-ai/sdk`, `TypeSafeClient.systemOne()`, the answer type is inferred from the question |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, Bearer `TYPESAFE_API_KEY` |
| Version pinning | Model ID `jev-1.14.0` can be pinned (`jev-1.13.0` also exists), avoiding the `jev-latest` alias |
| Fields | Choice: `choice`, `probabilities`, `confidence`; Noul: only `noul` (no confidence), as in the PRD |
| Usage | Returns `usage.input_tokens` and `usage.output_tokens`; billed on input tokens ($0.042 / Mtok) |
| Runs without a key | Passes. The SDK accepts an injected `fetch`, enabling recorded and scripted modes |
| Real call | Passes (2026-10-21). The Choice and Noul answers to the sample questions are sensible; one batched request takes about 0.3 s; rate limiting not verified |

### What it means for the design

- `JevJudge` uses the official SDK directly; `ScriptedJudge` replays through an injected `fetch`
  and goes through the same parsing.
- One request can ask several questions, so an order's semantic checks can share one call.
- The SDK retries on its own (2 times by default, 10 s each). So that the budget guard counts
  accurately, SDK retries are off (`maxRetries: 0`) and the harness manages retries.
- The environment variable is the official `TYPESAFE_API_KEY`.

## Trace propagation (OpenTelemetry API 1.9.1 / SDK 2.12.0)

Reproduce: `pnpm --filter @durable-jev/spike-trace propagation`

| Check | Result |
|---|---|
| Across services | Passes. The coordinator writes a W3C `traceparent` with `propagation.inject`; after `extract` in cargo assurance the span shares the upstream traceId with the upstream span as parent |
| A new trace after recovery | Passes. `run.resumed` is a new root span (new traceId) with a span link to the span before the interruption |
| Business correlation | Passes. The correlationId is a span attribute and stays the same across both traces |

### What it means for the design

- Only `@opentelemetry/api` plus the SDK's manual propagation, no automatic instrumentation, so the
  behaviour is predictable.
- When spans are stored for observation their links are stored too; the console joins old and new
  traces by correlationId and links.
- The A2A client can inject `traceparent` with the SDK's `CallInterceptor`; to be verified in T5.1.

## Pinned versions

| Dependency | Version |
|---|---|
| Node | 22.22.0 |
| pnpm | 10.28.0 |
| TypeScript | 6.0.3 |
| `@earendil-works/pi-durable` / `pi-ai` / `chord` | 1.3.0 |
| `@a2a-js/sdk` | 1.3.0 |
| `@typesafe-ai/sdk` | 0.7.0, model `jev-1.14.0` |
| `@opentelemetry/api` | 1.9.1 |
| `@opentelemetry/sdk-trace-node` / `sdk-trace-base` | 2.12.0 |
| Express | 5.3.0 |

Every dependency is written to `package.json` at an exact version (`save-exact=true` in `.npmrc`),
and the lockfile is committed.

## Summary

| Dependency | Feasible | Main limits |
|---|---|---|
| Pi Durable | Yes (agents and module-level flows) | Experimental; one process owns a store; after a restart `waitForTask` may return a non-terminal record; `callers` and `restartLimit` not yet verified |
| A2A SDK | Yes | No deduplication of retries; server adapters for Express and gRPC only |
| Jev | Yes | Rate limiting not verified |
| OpenTelemetry | Yes | None |

`pnpm spikes` runs every spike at once.
