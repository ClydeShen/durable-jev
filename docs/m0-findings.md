# M0 technical spike findings

Every spike is reproducible in this repository. Findings apply only to the pinned versions.

## Pi Durable 1.3.0

Reproduce: `pnpm --filter @durable-jev/spike-pi-durable crash-recovery` (scripted model, no key needed)

Scenario: an investigation agent calls the read-only tool `get_vehicle`, the human-only tool `approve_compliance`, then the write tool `reserve_transport`. The process is killed after the write lands in the business ledger but before the result is committed (F02), then restarted.

| Check | Result |
|---|---|
| Resume the same task after restart | Pass. The same `requestId` returns the same submission and continues from the checkpoint to completion |
| Completed read-only tools are not re-run | Pass. Results are read back from storage |
| Write tools are not replayed | Pass. A tool without `replay: "safe"` gets an `interrupted` error after restart and is not executed again |
| Handling the uncertain state | Pass. On `interrupted` the model calls `get_operation_status`, which confirms the write took effect; the ledger has exactly one entry |
| Human-only tool blocked | Pass. The `beforeTool` hook returns block and the model receives a `blocked` error result |
| Usage accounting | Pass. `harness.usage()` aggregates by provider/model, including failed attempts |
| Runs without a key | Pass. pi-ai ships a faux provider for scripted model responses |

Not provided by 1.3.0 (checked against the installed package's types and README):

- No `restartLimit` / `retryTask`. An earlier note saying "restartLimit not yet verified" was wrong; it came from the unreleased README on the GitHub main branch. Crash-loop protection is implemented by this project's `RunBudgetGuard`.
- `callers` only distinguishes `"model"` and `"tools"`; there is no "human only" caller. Human-only tools are protected by not registering them with the agent plus a `beforeTool` hook.

### Impact on the design

- `replayPolicy: verifyByOperationId` maps directly onto Pi's default (non-replay-safe) behaviour, combined with the business-side `get_operation_status`.
- Pi's `requestId` only makes *submission* idempotent; idempotent business side effects still rely on our operationId and unique constraints in the business database.
- Human-only tools are never registered with the agent; the hook is a second line of defence (Pi's `callers` cannot express "human only").
- Restart limits and crash-loop protection are implemented by this project and must not be listed as provided by Pi in runtime-controls.
- The faux provider can back `ScriptedJudge` and the scripted investigation model.

### Limitations

- The API is marked Experimental; pinned to 1.3.0.
- A store can be owned by one process only; there is no cross-process lock.
- SQLite storage uses Node's built-in `node:sqlite` (prints an ExperimentalWarning).
- Power loss or host failure may lose the latest commit (`synchronous = NORMAL`), consistent with the PRD only promising recovery from process crashes.

## A2A SDK `@a2a-js/sdk` 1.3.0 (protocol v1.0)

Reproduce: `pnpm --filter @durable-jev/spike-a2a round-trip`

Scenario: Cargo Assurance exposes its capability over A2A JSON-RPC; a client discovers the Agent Card, starts a verification, receives input-required, supplies the missing data and gets a structured Artifact.

| Check | Result |
|---|---|
| Capability discovery | Pass. `ClientFactory.createFromUrl` reads `/.well-known/agent-card.json` |
| Task lookup | Pass. `getTask` returns the same task state |
| Missing-information mapping | Pass. `INPUT_REQUIRED` carries the missing fields; a follow-up message with the original taskId moves the task to `COMPLETED` |
| Structured business result | Pass. Business checks are placed in the Artifact as a data part |
| Duplicate request deduplication (F04) | **Not provided.** Resending the same `messageId` creates a new task and runs it again |

### Impact on the design

- For F04, `a2a-adapter` keeps a `(caseId, revision, capability) → a2aTaskId` mapping and returns the original task on retry.
- The SDK server only offers an Express adapter (plus gRPC). All services use Express 5 instead of Fastify.
- AgentInterface must declare `protocolVersion: '1.0'` or the server rejects every request.
- The default `InMemoryTaskStore` is lost on restart; the SDK offers a Kysely-based `DatabaseTaskStore` (works with SQLite). Whether to adopt it is decided in T5.1.

## Jev `@typesafe-ai/sdk` 0.7.0

Reproduce: `pnpm --filter @durable-jev/spike-jev semantic-checks`. Defaults to recorded mode (an injected `fetch` returns a response recorded from a real call), so it uses no quota. It only calls the real API when `MODEL_MODE=live` and `TYPESAFE_API_KEY` is set.

Scenario: one request asks R18 (risk signal in an inspection note, Choice) and R10 (safety data sheet consistent with the declaration, Noul) together.

| Check | Result |
|---|---|
| Official TS SDK | Yes: `@typesafe-ai/sdk`, `TypeSafeClient.systemOne()`, answer types inferred from the questions |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, Bearer `TYPESAFE_API_KEY` |
| Version pinning | Model ID `jev-1.14.0` can be pinned (`jev-1.13.0` also available), avoiding the `jev-latest` alias |
| Fields | Choice: `choice`, `probabilities`, `confidence`; Noul: only `noul` (no confidence), as the PRD assumes |
| Usage | Returns `usage.input_tokens` and `usage.output_tokens` (measured 440 / 77). Official pricing bills input tokens ($0.042 / Mtok); whether output tokens are billed has not been checked against an invoice |
| Runs without a key | Pass. The SDK accepts an injected `fetch`, enabling recorded/scripted modes |
| Live calls | Pass (2026-10-19, 6 calls). See the table below |
| Authentication failure | A bad key throws `AuthenticationError` (401), which can be reported as ERROR rather than a business UNKNOWN |

Live results (same input, 6 consecutive calls, `jev-1.14.0`):

| Question | Result | Stability |
|---|---|---|
| R18 `packagingRisk` (Choice) | 6/6 `damaged_packaging`; probability 0.84–0.88, `cold_chain_risk` 0.12–0.16, `no_risk` 0; confidence 0.76–0.82 | Stable decision, small probability drift |
| R10 `documentMatchesDeclaration` (Noul) | 0.04–0.05 (vaccines vs a lithium battery SDS, correctly judged inconsistent) | Stable |
| Latency | 224–319 ms (including TLS setup, two questions per request) | |
| Usage | input 440 / output 77 tokens per call | Deterministic |

Not yet verified: rate limiting (429), latency for large question batches, quality across the full sample set (left to B1).

Choice `confidence` is derived entirely from `probabilities`: `(n·p_max − 1) / (n − 1)` (measured n=3, p_max=0.85 → 0.775, returned 0.77). It is not an independent signal. Noul has no confidence.

Officially documented limitations (only a `jev-1.13` limitations page has been published; none for `1.14` yet):

| Limitation | How this project handles it |
|---|---|
| Arithmetic, counting and date comparison are unreliable | Always done in code rules; Jev only answers semantic questions (FR-06) |
| Injected content in the state influences answers | F09; `ContextAssembler` partitions input and sends only the required fields; decisions still come from the rule engine and human gates |
| Choice favours the first-listed option | B1 adds a variant with shuffled option order |
| More irrelevant state lowers accuracy | Input is filtered by `inputPaths` so each question only gets the fields it needs |

### Impact on the design

- `JevJudge` uses the official SDK directly; `ScriptedJudge` replays through an injected `fetch` and shares the same parsing path.
- One request can carry several questions, so multiple semantic checks for the same order can be batched into one call.
- The SDK retries by itself (2 retries, 10 s per attempt by default). To keep the budget guard's counts accurate, SDK retries are disabled (`maxRetries: 0`) and the harness owns retries.
- The environment variable uses the official name `TYPESAFE_API_KEY`.
- Probability/confidence drift slightly for identical input, so replay and regression tests must not depend on live results and must go through `ScriptedJudge`. Gate decisions depend only on the mapped discrete outcome, and thresholds should stay clear of the observed drift range.

## Trace propagation (OpenTelemetry API 1.9.1 / SDK 2.12.0)

Reproduce: `pnpm --filter @durable-jev/spike-trace propagation`

| Check | Result |
|---|---|
| Cross-service propagation | Pass. The coordinator writes a W3C `traceparent` via `propagation.inject`; after `extract`, Cargo Assurance's span has the upstream traceId and the upstream span as parent |
| New trace after recovery | Pass. `run.resumed` is a new root span (new traceId) with a span link to the span before the interruption |
| Business correlation | Pass. correlationId is a span attribute and stays the same across both traces |

### Impact on the design

- Use `@opentelemetry/api` plus manual propagation with the SDK, no auto-instrumentation, for predictable behaviour.
- The observability store keeps span links; the Console joins old and new traces by correlationId and links.
- The A2A client can inject `traceparent` through the SDK's `CallInterceptor`; to be verified in T5.1.

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

All dependencies are pinned to exact versions in `package.json` (`save-exact=true` in `.npmrc`), and the lockfile is committed.

## Summary

| Dependency | Feasibility | Main limitations |
|---|---|---|
| Pi Durable | Feasible | Experimental; one process owns a store; no `restartLimit`; `callers` cannot express human-only |
| A2A SDK | Feasible | No retry deduplication; only Express/gRPC server adapters |
| Jev | Feasible (live calls verified) | Small probability drift; rate limiting not verified |
| OpenTelemetry | Feasible | None |

`pnpm spikes` runs every spike.
