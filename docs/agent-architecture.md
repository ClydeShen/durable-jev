# Agent architecture

For a technical leader deciding whether this approach can carry a large rule estate: how many
agents there are, what each owns, how they work together, and what it takes to grow and maintain
them. Numbers come from the current rule pack (`eval/materials/rules.json`) and the evidence runs
(`pnpm replay`, `pnpm faults`, `pnpm screening`).

## The idea in one paragraph

A **Durable Jev Agent** is one business module packaged as a service: its rules are data (a rule
graph), structured rules are evaluated as FEEL expressions, unstructured ones are questions to
Jev, approvals and field work are human gates. Project SQLite persists business state and waiting;
Pi Durable checkpoints the optional investigation helper. Modules talk over a common A2A contract.
Instead of hand-coding thousands of rules into a
rule engine and decision tables, a small team writes policy text, lets the authoring agent turn it
into validated rule definitions, reviews the diff, and ships data. Code is kept for what code does
best: one rule in 150 is code (R29, booking transport capacity).

The cleanup candidate shares validated case/runtime contracts across domains; logistics supplies
its facts, vocabulary, tools and policy pack. See [baseline.md](baseline.md) for the exact shared
boundary, recovery ownership, acceptance evidence and limits. This is capability research, not
an established enterprise cost-saving or production-readiness claim.

## The agents

| Agent | Business it owns | Rules (expression / Jev / human / combinator / other) | People it works with |
|---|---|---|---|
| Order coordination | Takes the order, aggregates every agent's verdict, release and dispatch | 7 (3 / 0 / 1 / 3 / 0) | Warehouse operator (loading), dispatcher |
| Cargo assurance | Classification, controlled and cold-chain checks, documents, repack and retest | 16 (6 / 3 / 4 / 2 / 1 decision table) | Compliance and quality reviewers, warehouse operator |
| Transport planning | Route, vehicle, carrier, transfer hubs, capacity booking; investigation helper when a carrier cancels | 9 (7 / 0 / 0 / 1 / 1 code) | Transport planner |
| Commercial control | Credit, quote, extra cost, customer contract terms | 44 (35 / 4 / 3 / 2 / 0) | Commercial manager |
| Destination compliance *(added as the extension)* | Destination import requirements, commodity classification | 74 (48 / 25 / 0 / 1 / 0) | – |
| **Total** | | **150 (99 / 32 / 8 / 9 / 2)** | 7 roles |

Each agent is the same program (`apps/agent`) started with a different `AGENT_ID`; it executes only
the rules it owns and receives the other agents' results ([orchestration.ts](../packages/agent-core/src/orchestration.ts)).
The console's **Agents** view shows these five as one graph; clicking an agent opens its own rules
with the rules it depends on in other agents drawn as dashed boundary nodes.

## Inside one agent

```
           policy text ──► authoring agent ──► validated rule definitions (data)
                                                         │
 A2A / HTTP ──► CaseRuntime ── evaluates its rule graph ─┼─ FEEL expressions, decision tables
                   │                                     ├─ Jev questions (semantic rules)
                   │                                     ├─ human gates (approval chains, field work)
                   │                                     └─ code rules (only where code is better)
                   ├─ SQLite store: case, outcomes, human tasks, outbox events
                   └─ investigation helper (optional, Pi Durable): proposes, never decides
```

- **Results are reused, not recomputed.** Every outcome carries a fingerprint of its inputs; a
  change only re-evaluates what it touches and labels the rest with the change that invalidated it
  (`r2 (route, carrier, quote)` in LOG-004).
- **Human work is part of the graph.** An approval chain of two or three roles, four-eyes,
  evidence requirements and expiry are rule configuration, not workflow code.
- **The investigation helper** (transport planning) is the only part where a model chooses its
  next step. It can read, search and pre-check, and submit one proposal; a planner confirms it.
  Its limits are listed in [runtime-controls.md](runtime-controls.md).

## How agents work together

- **Order coordination drives each case** through rounds: submit the revision to every agent,
  hand each agent the others' latest results, repeat until nothing changes (at most 12 rounds).
  Agents that are down are skipped and caught up when they return.
- **The contract between agents is the rule graph and the business result**, nothing else: no
  shared database, no calls into each other's code. 9 rules depend on rules of another agent (22 dependencies in all); the
  overview draws these as edges (for example commercial → order coordination labelled "4").
- **Peer collaboration in LOG-004:** transport's helper finds a replacement carrier → the planner
  confirms → the new revision invalidates cargo's compliance sign-off (two roles sign again) and
  triggers commercial's extra-cost approval, while customer checks are reused.
- **Transport is swappable.** The same `AgentClient` interface runs over native HTTP or A2A (Agent
  Card + one A2A Task per call); `pnpm start:a2a` switches with no business code change, and the
  browser runs of LOG-001 and LOG-004 give the same results in both modes.

## Growing and maintaining it

**Adding rules** is writing policy text. Appendices G and H of `policy-v1.md` added 108 rules (80
expression, 27 Jev, 1 human step) through `pnpm author "<section>"`, which validates the proposal (references,
parameters, cycles, FEEL syntax, selection keys) and produces a diff to review; `pnpm author
--apply` merges it. Today those two appendices replay draft recordings; with `MODEL_MODE=live` the
authoring model writes them.

**Scaling to thousands of rules** relies on selection, not on evaluating everything. Each
extension rule declares where it applies (destination, customer, commodity group); the engine
indexes them and filters non-matching rules before any evaluation. The commodity group comes from
a Jev classification (R42) that selects every plausible group, so uncertainty widens the selection
instead of missing a rule. Each demo order evaluates 4 to 11 of the 108 extension rules; the 26
screening samples have no missed rule (`pnpm screening`).

**Adding an agent** is configuration. The destination-compliance agent needed:

1. rules whose `owner` is the new agent (here, the Schedule G rules) and one dependency from an
   existing rule (R40 now also requires R41);
2. a name and description for its Agent Card (`agentProfiles`);
3. one line in the launcher's service list.

The four existing agents did not change: they load the same rule pack and the orchestrator derives
the agent set from the rule owners. Logistics agent identities are validated against its profiles,
not a global engine enum. A different domain supplies its own identities, roles and scopes.

**Changing a policy value** (a threshold, a cap) is a parameter in `policy-parameters.json` or a
rule edit, re-validated on load. Expression input paths participate in fingerprints, but changes
to human-gate applicability/parameters need an explicit rule-version bump to retire stale tasks.
That can conservatively require another approval; policy-change experiments measure the outcome
and work under both existing-case strategies rather than assume all changes are automatic.

## Reliability

`pnpm faults` runs 18 failure scenarios: crashes mid-investigation, after a write and while a
human approval is open (real process exits, then recovery from the same files), retried A2A
requests, model timeouts, prompt injection in a document, a looping helper, unauthorised, expired
and late approvals, missing evidence, concurrent confirmations, broken rule configuration, a
failing cargo item and a release racing a new revision. All hold except F06, which does not apply
yet (the console polls snapshots; there is no SSE).

## What is not proven yet

- Live runs: all 8 demo cases replay with live Jev and the live investigation helper, three runs
  in a row, and screening has no missed rule; see [tuning-log.md](tuning-log.md). These are
  development-set numbers; there is no blind set yet, and the benchmarks (Jev vs structured
  output, fixed workflow vs helper, native vs A2A, cost per rule) are still to run.
- Draft materials: the screening samples' expected groups and the Schedule G and H recordings need a
  reviewer.
- Trace propagation across agents and a restart cap for the helper are open (see
  [runtime-controls.md](runtime-controls.md)).
