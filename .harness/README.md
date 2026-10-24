# .harness

The shared working aid autonomously maintained by delivery agents, including Codex and Claude.
It records agreements, design, progress, limits and handoffs; it is not application runtime code.
User-facing documents and test materials belong in `docs/` and `eval/`. Protected files, including
`prd.md`, retain their existing owner-consent restrictions.

| File | Purpose | When it changes |
|---|---|---|
| `prd.md` | The original PRD v0.3, read-only | Replaced whole when the user gives a new version |
| `spec.md` | Scope and cuts agreed with the user; takes precedence over `prd.md` | When the user changes the scope |
| `design.md` | Architecture, interfaces, semantics, engineering conventions | When a design decision changes |
| `roadmap.md` | Phases → tasks, with status | After every completed task |
| `implementation-notes.md` | Plan changes and surprises that differ from spec, design or a task | High-level surprises only, not implementation detail |

## Working protocol

1. Before a task, read `implementation-notes.md`, `spec.md`, `design.md` and the task in `roadmap.md`.
2. One or a few small commits per task; tick it in `roadmap.md` when done.
3. When departing from the design or a task's goal, change `design.md` / `roadmap.md` first, then
   note the reason in one line in `implementation-notes.md`.
4. Precedence on conflict: the user's latest instruction > `spec.md` > `design.md` > `prd.md`.
5. Preserve frozen recovery refs. Current baseline recovery and its documentation revision are
   recorded in `../docs/baseline.md`; later experiment adaptations must remain measurable.
6. Before each stage archive, synchronize the handoff, roadmap, evidence and Chinese demo script.
   Confirm that every advertised action exists and separate scripted, live and future capabilities.
