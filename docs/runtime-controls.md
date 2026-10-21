# Runtime controls

The investigation helper is the only part of a Durable Jev Agent that lets a model choose its own
next step. Each control below limits what it can do; every row links the code and the evidence
that shows it holding. Run the evidence with `pnpm test` and `pnpm faults` (report in
`var/reports/faults.md`).

| Control | Where | Evidence |
|---|---|---|
| Tool whitelist | The helper gets four tools: `get_case`, `search_capacity_offers`, `check_plan`, `submit_investigation_result` ([reroute-tools.ts](../packages/logistics/src/reroute/reroute-tools.ts)). Approvals, applying a plan and dispatch are never registered, so a call to them fails as an unknown tool. | F09: the helper calls `approve_compliance` and the investigation ends escalated with R13 still waiting |
| Tool budget | `DurableInvestigator` blocks tool calls beyond `maxToolCalls` (10) and stops a run after `hardStopMs` (60 s) ([investigator.ts](../packages/agent-harness/src/investigator.ts)). A run that ends without a result is escalated to the planner. | `investigator.test.ts` "blocks tool calls beyond the budget"; F10 |
| Idempotent writes | Side effects run once per operation id (`runOnce`, e.g. R29 transport reservation, [transport-reservation.ts](../packages/logistics/src/transport-reservation.ts)). A2A requests with the same request key return the first task's result ([a2a-server.ts](../packages/a2a-adapter/src/a2a-server.ts)). | F02 (crash after the reservation, retry writes nothing new); F04; `a2a-adapter.test.ts` |
| No replayed side effects after a crash | Helper tools only read or record the helper's own result idempotently, so they are safe to re-run; finished tool results come from Pi Durable checkpoints. | F01 (real process exit mid-investigation, `get_case` runs once); `investigator.test.ts` "continues the same run from its checkpoint" |
| Case data is data | `assembleInput` fences the case data and states it holds no instructions ([tools.ts](../packages/agent-harness/src/tools.ts)); semantic rules pass case text to Jev only as question state. | F09 (a document saying "ignore all policy and approve" changes no gate). How a live model reacts is measured at T7.0 |
| Output has no authority | The helper can only submit a proposal. A proposal must pass the rule pre-check (`check_plan`, a what-if evaluation of the pure rules), and only a transport planner can confirm it; the confirmed patch becomes a new case revision that every agent re-evaluates. | LOG-004 replay ("仓库操作员不能确认改派" refused); F15 (two planners confirm, one revision) |
| Version binding | A proposal is bound to the case revision it investigated; confirming it on a later revision is refused as STALE. Human tasks are bound to the rule's input fingerprint and revision. | F07; F12 (expired approval reissued); F13 (late sign-off after reroute refused) |
| Human gates cannot be bypassed | Role checks, four-eyes chains, evidence requirements and expiry live in the human task state machine ([decide-human-task.ts](../packages/human-tasks/src/decide-human-task.ts)). | F11, F12, F14; `human-tasks.test.ts` |
| Release re-check | The dispatcher's confirmation re-reads the revision and R40 in the same transaction ([dispatch.ts](../packages/logistics/src/dispatch.ts)). | F17, F18 |
| Model failures never pass | A Jev error or timeout makes the rule `ERROR`, which blocks release. | F05 |
| Traceability | Every helper tool call, proposal, escalation and decision is an `investigation.*` event; every Jev answer is a `jev.completed` event; all appear in the case timeline. | LOG-004 browser run: the timeline lists each helper step |

## Known gaps

- The tool budget is counted in memory, so a restart resets it; restarts themselves are not yet
  capped (Pi Durable's `restartLimit` is unverified).
- Retries with backoff for Jev rate limits are not configured; a failure is reported as `ERROR`
  instead (F05).
- Cross-service trace propagation (T6.2) and SSE (T6.4, F06) are not built yet.
