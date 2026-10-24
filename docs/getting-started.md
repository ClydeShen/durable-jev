# Getting started

## Requirements

- Node 26 (26.12 or a later 26.x, as in `mise.toml` and CI; `pnpm install` refuses anything older
  or another major version). With nvm: `nvm install 26.12.1`, then `nvm use 26.12.1`
- pnpm 10 or later: it switches itself to the version in `packageManager` (12.15.0)
- Optional: with [mise](https://mise.jdx.dev) installed, run `mise install` at the repository root
  to get the same Node and gitleaks versions as CI (see `mise.toml`)
- No key needed: `MODEL_MODE=scripted` is the default, and Jev's judgements replay the answers
  recorded in the case files

## Start everything

```bash
pnpm bootstrap   # install dependencies and build
pnpm start       # build and start every service
```

Once the services are up, the end of the log shows "✔ Durable Jev demo is ready" with the address
<http://localhost:4100>, and the default browser opens (set `OPEN_BROWSER=false` to keep it
closed). The demo data loads on the first start; "Reset demo" at the top right of the page or
`pnpm demo:reset` restores it at any time, and the reset icon in a case header ("Reset this case") restores only
that case.

## Walk through LOG-001: general cargo from order to dispatch

1. Pick **LOG-001** on the left. Its status is "Action required": it waits for the warehouse operator.
2. The middle shows the rule graph: boxes are rules, lines are dependencies, colours are statuses.
   Everything passes except R39 (loading) and R40 (release). Click any box to see each item's or
   leg's result, observed value and what blocks it.
3. Choose **Warehouse operator** as the current role at the top right, fill in the load scan ID and
   seal number in the task on the right, and click "Complete and submit". Leaving either out is
   refused.
4. Switch to **Dispatcher**: the case becomes "Ready to dispatch"; click "Confirm dispatch". In one
   transaction the system checks R40 and the revision again, and only then marks it "Dispatched".

Worth trying too: acting on a task in the wrong role, confirming dispatch too early (it says what
blocks it), dispatching twice.

## Commands

| Command | What it does |
|---|---|
| `pnpm bootstrap` | Install dependencies and build |
| `pnpm start` | Build and start every service, reading `.env` if present |
| `pnpm start:a2a` | The same, but order coordination calls the other agents over A2A (Agent Card + JSON-RPC) |
| `pnpm demo:reset` | Load the demo cases again (with the services running) |
| `pnpm replay` | Replay the 8 demo cases, asserting each stage |
| `pnpm faults` | Fault scenarios F01–F18 (F01–F03 kill real processes and recover); the report goes to `var/reports/faults.md` |
| `pnpm screening` | Check classification and rule selection against the screening samples for missed rules (real Jev with `MODEL_MODE=live`) |
| `pnpm eval:portability` | Record schema reuse boundaries and source hashes; no model calls or business correctness claim |
| `pnpm eval:policy-change` | Check the approved P1 threshold in isolated copies; compare pinned/re-evaluated old orders, full-flow dispatch and process recovery; scripted only, reports under `var/reports/policy-change-*` |
| `pnpm check` | Everything before a commit: lint (warnings fail), workspace consistency, type checks (tests and web included), architecture boundaries, knip, duplication, unit tests; each rule is in [engineering.md](engineering.md) |
| `pnpm materials:lock` | Record new hashes once you approve a change to a protected file (PRD, policy, rules, test materials); run by a person only |
| `pnpm architecture` | Regenerate [architecture-graph.md](architecture-graph.md) from the real imports |
| `pnpm security` | Check dependencies for known vulnerabilities (needs the network) |
| `pnpm spikes` | The M0 technical spikes; findings in [m0-findings.md](m0-findings.md) |

## Model modes

| `MODEL_MODE` | Behaviour |
|---|---|
| `scripted` (default) | No real model is called; Jev's judgements replay `scriptedJudgements` from `eval/materials/cases/*.json` |
| `live` | Calls the real Jev (`TYPESAFE_API_KEY`). Real calls happen only when this is set to `live` explicitly |

Copy `.env.example` to `.env` and edit it; `pnpm start` reads it. `pnpm models:live-check` has each
of the two real models answer a sample question once.

## Folders

| Path | Contents |
|---|---|
| `apps/coordinator` | Order coordination service: API, release transaction, static pages |
| `apps/web` | The console |
| `packages/agent-core` | Durable Jev Agent runtime: rule pack loading, case evaluation, human gates |
| `packages/rule-engine` | Rule graph evaluation, FEEL expressions, combinators, validation, fingerprints and invalidation |
| `packages/human-tasks` | Human task state machine and approval chains |
| `packages/model-providers` | Jev, structured output, scripted judgements |
| `packages/logistics` | Reference data, case files, turning an order into rule facts |
| `packages/store` | SQLite, migrations, idempotent operations, outbox |
| `eval/materials` | Policy text, policy parameters, rule pack, mock data, cases |
| `var/data` | Runtime databases (not committed) |
