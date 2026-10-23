# .harness

The Claude delivery agent's workspace, managed by the agent. User documents and test materials do
not belong here.

| File | Purpose | When it changes |
|---|---|---|
| `prd.md` | The original PRD v0.3, read-only | Replaced whole when the user gives a new version |
| `spec.md` | Scope and cuts agreed with the user; takes precedence over `prd.md` | When the user changes the scope |
| `design.md` | Architecture, interfaces, semantics, engineering conventions | When a design decision changes |
| `roadmap.md` | Phases → tasks, with status | After every completed task |
| `implementation-notes.md` | Plan changes and surprises that differ from spec, design or a task | High-level surprises only, not implementation detail |

## Working protocol

1. Before a task, read `spec.md`, `design.md` and the task in `roadmap.md`.
2. One or a few small commits per task; tick it in `roadmap.md` when done.
3. When departing from the design or a task's goal, change `design.md` / `roadmap.md` first, then
   note the reason in one line in `implementation-notes.md`.
4. Precedence on conflict: the user's latest instruction > `spec.md` > `design.md` > `prd.md`.
