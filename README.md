# durable-jev

A proof of concept for durable business agents: a console for releasing transport orders and
handling exceptions.

```bash
pnpm bootstrap   # install dependencies and build
pnpm start       # start every service; the browser opens http://localhost:4100
```

`MODEL_MODE=scripted` is the default, so the whole demo runs without any key.

## Documents

Active work: **`feat/durable-policy-workflow`**. The official baseline is
`backup/baseline-2026-10-24-r2`. See [branch and milestone strategy](docs/branch-strategy.md)
for the four numbered milestone archives; none is complete or created yet.

| To | Read |
|---|---|
| Run it, walk through LOG-001, look up a command | [getting-started.md](docs/getting-started.md) |
| Give a demo of about 20 minutes (in Chinese, for the presenter) | [demo-guide.md](docs/demo-guide.md) |
| Recover the frozen runnable demo | [demo-checkpoint.md](docs/demo-checkpoint.md) |
| Review or restore the frozen experimental baseline | [baseline.md](docs/baseline.md) |
| Follow post-baseline workflow evidence, CEO viewpoints and recovery checkpoints | [workflow-progress.md](docs/workflow-progress.md) |
| Inspect investigation strategy and checkpoint controls, including memory recovery failures | [investigation-experiment.md](docs/investigation-experiment.md) |
| Inspect approval/evidence migration and isolated authoring rehearsal | [gate-change-experiment.md](docs/gate-change-experiment.md) |
| Inspect three bounded real Jev judgments and remaining request allowance | [jev-probe.md](docs/jev-probe.md) |
| Take over the current direction and working-branch plan | [implementation-notes.md](.harness/implementation-notes.md) |
| Understand how the agents are organised and whether they carry a large rule estate | [agent-architecture.md](docs/agent-architecture.md) |
| See the investigation helper's budgets, timeouts and human checkpoints | [runtime-controls.md](docs/runtime-controls.md) |
| Follow the tuning of the real models and its results | [tuning-log.md](docs/tuning-log.md) |
| See the real dependencies between packages (generated) | [architecture-graph.md](docs/architecture-graph.md) |
| Learn the engineering conventions and which tool enforces each | [engineering.md](docs/engineering.md) |
| Review the M0 technical spike findings | [m0-findings.md](docs/m0-findings.md) |

## Folders

| Folder | Contents |
|---|---|
| `apps/` | `coordinator` (order coordination agent and API), `agent` (the business agent processes), `web` (the console) |
| `packages/` | The reusable core: `contracts`, `rule-engine`, `agent-core`, `agent-harness`, `agent-transport`, `logistics` and more |
| `eval/` | Demo materials, replay, screening and fault scenarios |
| `tools/`, `scripts/` | Development helpers |
| `spikes/` | Reproducible experiments from the M0 spikes |

Run `pnpm check` before committing; CI runs the same checks.
