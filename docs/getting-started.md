# Getting started

## Requirements

- Node 22+
- pnpm 10+
- No API key needed: the default `MODEL_MODE=scripted` answers semantic questions from scripted answers in the case files.

## Run it in three steps

```bash
pnpm bootstrap     # install dependencies and build
pnpm start         # start the coordinator, the workbench and the local control server
pnpm demo:reset    # in a second terminal: wipe data and load the demo cases
```

`pnpm start` prints:

| URL | What |
|---|---|
| http://127.0.0.1:5173/ | Workbench |
| http://127.0.0.1:4100/cases | Coordinator API |
| http://127.0.0.1:4000/processes | Local control server (listens on 127.0.0.1 only) |

`Ctrl+C` stops every process. Data lives in `var/data/` and survives restarts; `pnpm demo:reset` or the workbench's "Reset demo" button wipes it and reloads the cases.

## Walkthrough: LOG-001, general cargo from submission to dispatch

1. Open the workbench and select LOG-001 on the left. The order is "Awaiting human".
2. Expand the rule tree: every gate except R39 shows "Pass"; R39-CONFIRM shows "blocked by R39-LOAD".
3. Switch "Acting as" to "Dispatcher" and click "Submit evidence" on the R39-LOAD task. The server answers 403 because loading must be done by a warehouse operator (F11).
4. Switch back to "Warehouse operator", fill in `loadScanRef` and `physicalCheckBy`, and submit. Leaving either field empty is rejected (F14). The order becomes "Ready to dispatch".
5. Switch to "Dispatcher" and click "Confirm dispatch". In one transaction the coordinator re-reads the current revision and re-evaluates R40; only if it passes is the order written as "Dispatched". Otherwise the whole transaction rolls back.

## Process control

The local control server is for demos (the workbench will call it in later phases):

```bash
curl -X POST http://127.0.0.1:4000/processes/coordinator/kill      # simulate a crash
curl -X POST http://127.0.0.1:4000/processes/coordinator/start     # restart; data is kept
curl http://127.0.0.1:4000/processes                               # process status
```

## Other commands

| Command | What |
|---|---|
| `pnpm test` | Run unit tests |
| `pnpm lint` | Check formatting and lint |
| `pnpm spikes` | Run the M0 technical spikes; findings in [m0-findings.md](m0-findings.md) |

## Model mode and API quota

Copy `.env.example` to `.env`. The default `MODEL_MODE=scripted` means tests, spikes and the demo never send real requests.
Jev is only called when you explicitly set `MODEL_MODE=live` and provide `TYPESAFE_API_KEY`. Jev quota is limited, so live mode is reserved for key end-to-end tests.

## Troubleshooting

- Port already in use: make sure nothing else is on 4000, 4100 or 5173, or stop the previous `pnpm start` with `Ctrl+C`.
- `pnpm demo:reset` cannot connect: run `pnpm start` in another terminal first.
