# Getting started

## Requirements

- Node 22+
- pnpm 10+
- No API key needed: the default `MODEL_MODE=scripted` answers semantic questions from scripted answers in the case files.

## Run it in three steps

```bash
pnpm bootstrap     # install dependencies and build
pnpm start         # start the services, the workbench and the local control server
pnpm demo:reset    # in a second terminal: wipe data and load the demo cases
```

`pnpm start` prints:

| URL | What |
|---|---|
| http://127.0.0.1:5173/ | Workbench |
| http://127.0.0.1:4100/cases | Coordinator API: orders, human tasks, dispatch |
| http://127.0.0.1:4110/capabilities | Cargo assurance: controlled goods and cold chain rules |
| http://127.0.0.1:4120/capabilities | Transport planning: plan rules and carrier reservations |
| http://127.0.0.1:4130/capabilities | Commercial control: credit and cost rules |
| http://127.0.0.1:4000/processes | Local control server (listens on 127.0.0.1 only) |

Each service keeps its own SQLite database in `var/data/`. The coordinator owns orders and human tasks and asks the three branch services to evaluate their rules over HTTP (`POST /evaluations`).

Each branch service also speaks A2A: its Agent Card is at `/.well-known/agent-card.json` (for example http://127.0.0.1:4110/.well-known/agent-card.json) and its JSON-RPC endpoint at `/a2a/jsonrpc`. Start with `BRANCH_PROTOCOL=a2a pnpm start` to have the coordinator delegate over A2A instead of native HTTP; the orders end the same either way. Each delegation is recorded in the coordinator's `a2a_task_links` table, and a resent request returns the original A2A task instead of evaluating again.

`Ctrl+C` stops every process. Data survives restarts; `pnpm demo:reset` or the workbench's "Reset demo" button wipes it and reloads the cases.

The workbench keeps the selected case and view in the address (for example `http://127.0.0.1:5173/#/cases/CASE-LOG-003?view=tree`), so a reload or a pasted link opens the same screen. Icons come from one place (`apps/web/src/icons.tsx`, Lucide); the UI source contains no symbol characters, and a test enforces it. Every case starts with a summary of what failed and who it is waiting for; while an action runs the page shows "Working…" and disables the action buttons.

## Walkthrough: LOG-001, general cargo from submission to dispatch

1. Open the workbench and select LOG-001. The order is "Awaiting human".
2. The flow diagram shows the order from left to right: base checks, the branches that apply, loading, dispatcher confirmation and dispatch. Green dashed lines flow where a step has passed; an amber line stops where the order waits for a person; grey dotted lines are blocked upstream; red lines failed. Branches that do not apply (here: controlled goods and cold chain) are hidden unless you tick "show not applicable".
3. Click a branch to see its rules, or "All rules" for the whole graph; click a rule to see its result for each cargo item or leg. The "Rule tree" tab shows the same results as an expandable tree.
4. Switch "Acting as" to "Dispatcher" and click "Submit evidence" on the R39-LOAD task. The server answers 403 because loading must be done by a warehouse operator (F11).
5. Switch back to "Warehouse operator", fill in `loadScanRef` and `physicalCheckBy`, and submit. Leaving either field empty is rejected (F14). The order becomes "Ready to dispatch" and the line now stops at the dispatcher.
6. Switch to "Dispatcher" and click "Confirm dispatch". In one transaction the coordinator re-reads the current revision and re-evaluates R40; only if it passes is the order written as "Dispatched", and every line in the diagram flows. Otherwise the whole transaction rolls back.

## Walkthrough: change the plan

1. Select an order that is not yet dispatched and switch "Acting as" to "Transport planner".
2. Under "Plan changes", pick another vehicle for a leg and click "Reassign vehicle" (or pick another carrier and click "Change carrier").
3. The order gets a new revision. Only the rules that depend on the change are re-checked; they show "re-checked after r2" in the flow diagram, and "Revision history" lists how many rules were affected. Rules that do not depend on the change (for example the customer's credit) keep their results.
4. Human tasks bound to what changed are superseded and recreated; the old reservation for the previous route version is cancelled. A quote change by the "Commercial manager" re-asks for credit approvals but keeps a compliance sign-off.

## Walkthrough: let an agent find a replacement carrier

1. Select LOG-004 and switch "Acting as" to "Transport planner".
2. Under "Carrier investigation", keep or edit the reason and click "Find replacement".
3. The agent lists carriers that serve both ends of the leg and checks each vehicle by re-running the capacity, qualification, temperature, service area and equipment rules with that vehicle in the plan. It proposes Glacier with VEH-GL-REEFER-4T. Nothing in the order has changed yet.
4. Click "Accept proposal". The proposal is applied as an ordinary carrier change: a new revision, the affected rules re-checked, and the compliance sign-off asked for again. "Reject" with a reason leaves the plan as it is.
5. A proposal is only valid for the revision it was made for. If the plan changes first, it is marked out of date and cannot be accepted.

The agent can only read and propose; it has no tool to change the plan, approve or dispatch. Without a model key it runs a scripted investigator through the same tools and budget limits (10 tool calls, 3 model retries); a run that exceeds a limit is handed to the planner.

## Demo cases

`pnpm demo:reset` loads eight orders. Their event scripts are replayed and checked stage by stage with `pnpm replay`.

| Case | Story | What to try |
|---|---|---|
| LOG-001 | General cargo, one leg, complete documents | Load as warehouse operator, confirm as dispatcher |
| LOG-002 | Cold chain cargo arrives with damaged packaging | Jev flags the damage; "Approve" cannot replace the repack; repack, then capture the retest |
| LOG-003 | Controlled goods whose documents conflict with the declaration | The compliance reviewer checks the documents; a commercial manager cannot approve instead; the carrier lacks the qualification until the planner switches to Secura |
| LOG-004 | Controlled cold chain cargo whose carrier cancels | After the compliance sign-off, ask the agent for a replacement carrier and accept its Glacier proposal: the sign-off is voided and asked for again; credit checks keep their results |
| LOG-005 | A reroute raises the quote over credit | As commercial manager change the quote to 2400.00: credit exception and extra cost need two separate approvals |
| LOG-006 | The service restarts during the quality review | Kill and restart the coordinator; the quality task is still there |
| LOG-007 | The transfer hub cannot keep cargo cold | The plan fails at the hub; as planner, replacing the route through SHA-HUB clears it (scripted in `pnpm replay`) |
| LOG-008 | Quality approval was for an old packaging version | Approve with "rework required", record a failing retest, then the new packaging voids the earlier approval |

All expected results are drafts (`reviewStatus: draft`) until a reviewer signs them off.

## Process control

The local control server is for demos (the workbench will call it in later phases):

```bash
curl -X POST http://127.0.0.1:4000/processes/coordinator/kill      # simulate a crash
curl -X POST http://127.0.0.1:4000/processes/coordinator/start     # restart; data is kept
curl http://127.0.0.1:4000/processes                               # process status
```

### Walkthrough: crashes, slow services and duplicates from the workbench

Open "Demo controls" under the case list.

1. Select LOG-006 and leave the quality review (R20) open. Click "Kill" next to the coordinator: the workbench reports that it cannot reach the coordinator. Click "Start": the same R20 task is still there; approve it as "Quality reviewer".
2. As "Warehouse operator", complete the loading task, then click "Send again". The duplicate is refused (409) and the order stays ready to dispatch.
3. Click "Slow down" next to commercial-control and, as "Commercial manager", change the quote. The service now takes 12 s, longer than the coordinator waits, so the change ends in a technical failure. Click "Normal speed", then "Re-evaluate": the order recovers.

### Walkthrough: a branch service goes down

1. `curl -X POST http://127.0.0.1:4000/processes/commercial-control/kill`
2. Act on any open task in the workbench. The coordinator answers 503 and the order shows "Technical failure"; no rule is reported as passed.
3. `curl -X POST http://127.0.0.1:4000/processes/commercial-control/start`
4. Click "Re-evaluate" next to the order status. The order returns to its normal state.

## Other commands

| Command | What |
|---|---|
| `pnpm test` | Run unit tests |
| `pnpm lint` | Check formatting and lint |
| `pnpm spikes` | Run the M0 technical spikes; findings in [m0-findings.md](m0-findings.md) |
| `pnpm faults` | Run the fault scenarios F01–F18 (process kills, lost responses, model outages, duplicates, injection, loops, roles, expiry, concurrency, bad configuration); report in `var/reports/faults.md` |
| `pnpm replay` | Replay the demo cases stage by stage |

How the agent runtime is kept under control, with evidence for each control: [runtime-controls.md](runtime-controls.md).

## Model mode and API quota

Copy `.env.example` to `.env`. The default `MODEL_MODE=scripted` means tests, spikes and the demo never send real requests.
Jev is only called when you explicitly set `MODEL_MODE=live` and provide `TYPESAFE_API_KEY`. Jev quota is limited, so live mode is reserved for key end-to-end tests.

In live mode every service caches judgements by model, question and input in its own database, so re-evaluating an unchanged order does not call Jev again. To replay selected cases against Jev:

```bash
MODEL_MODE=live pnpm replay LOG-002 LOG-003
```

Live judgements are cached in `var/data/semantic-cache.sqlite`, so a rerun costs no quota. Each semantic result records the provider and model that answered it.

## Troubleshooting

- Port already in use, or "another instance is running": a service from an earlier run is still up. Stop the previous `pnpm start` with `Ctrl+C`, or find the process on 4000, 4100–4130 or 5173 and stop it.
- `pnpm demo:reset` cannot connect: run `pnpm start` in another terminal first.
