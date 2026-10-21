# Demo guide

A 15 to 20 minute walkthrough. After the first command everything happens in the browser: each order carries its own step-by-step guide, the fault drills and mode switches are buttons, and the Proof page runs the checks. Scripted answers are the default, so a run costs nothing and repeats exactly. Screens are described in [getting-started.md](getting-started.md).

## Start

```bash
pnpm demo
```

This installs, builds, starts every service, loads the eight demo orders and opens http://127.0.0.1:5173/. (On a machine without a desktop, open that address yourself.) "Reset demo" in the top bar returns to the starting state at any time.

## What to say first

Orders are checked against 50 rules. Some need a person, some need a text to be read. The question this demo answers is whether a language model and an agent can sit inside that process without taking decisions that belong to people, and without breaking when things go wrong. The rules decide; the model answers narrow questions; people approve; the system stays correct when services fail.

## Running order

| Min | Order or page | Message |
|---|---|---|
| 0-3 | LOG-001 | One order, a flow of rules, who is being waited on |
| 3-7 | LOG-003, LOG-005 | Only the right person can approve; a change re-checks only what depends on it |
| 7-10 | LOG-004 | An agent proposes, a person decides |
| 10-14 | LOG-006, LOG-002 | Crashes, slow services, duplicates and an unavailable model |
| 14-17 | Console | Every claim can be traced to events, calls and model judgements |
| 17-20 | Proof | Replay of the eight orders and the fault scenarios, run from the page |

Select an order and a guide card appears above its flow diagram. It lists the steps, tells you which role to act as (one click switches it), shows what to type and what you should see. It moves on by itself when the order changes. Steps marked optional can be skipped.

## 1. LOG-001, the happy path

Follow the guide. The points to make:

- Green dashed lines flow where a check passed; the amber line stops where a person is needed; grey dotted lines are blocked behind it.
- Acting as the wrong role, the server refuses (403). The task stays open.
- Dispatch re-checks the final rule inside the same transaction as the status change.
- Optional step: "Two changes at once" under Demo controls. Both changes are based on the same revision; one is applied, one is refused (409).

## 2. LOG-003 and LOG-005, approvals and changes

- LOG-003: the order is on hold because a check failed. Approvals cannot override a failed check. Changing the carrier re-checks only what depends on it; the credit result is kept; the compliance sign-off is asked for again.
- LOG-005: a quote change re-asks only the commercial approvals, one at a time.

## 3. LOG-004, the investigation agent

The agent proposes a replacement carrier; nothing changes until the transport planner accepts. The cancellation reason contains an instruction to approve the order; the agent only reads it as data and has no tool that could approve. Accepting voids the compliance sign-off and asks for it again.

## 4. Failures (LOG-006, LOG-002)

Open "Demo controls" in the sidebar.

- Kill and start the coordinator while a review is open: the same task is still there.
- "Send again" repeats the last action: refused with 409.
- "Slow down" a service, change the quote, then "Normal speed" and "Re-evaluate": the order shows a technical failure, then recovers.
- "Jev unavailable", then "Re-evaluate" on LOG-006: technical failure, no rule is passed on a guess. "Jev available again" and "Re-evaluate" recovers.
- LOG-007 and LOG-008 have their own guides: routing around a hub that cannot keep cargo cold, and a packaging change that voids earlier approvals and asks for them again.

## 5. The Console

Open Console in the top bar and pick the order you just worked on.

| Tab | Show |
|---|---|
| Cases | Machine time and time waiting for people, per order |
| Timeline | Everything in time order, with who did it; the coordinator restart is visible |
| Calls | Waterfall of service calls; a late human answer is its own trace, linked back |
| Judgements | What the model returned next to what the rule decided |
| Recovery | Restarts, voided results, failures |

From a rule node in the workbench, the links under the rule name open the Console on that rule.

## 6. Proof

Open Proof in the top bar. "Run" starts the replay of the eight orders (about 10 seconds) or the fault scenarios (a minute or two). Each result can be expanded. They run on their own copy of the services with scripted answers, so the orders on the workbench are not touched.

## Modes

Under "Demo controls", "Modes" switches between Native HTTP and A2A (how the coordinator calls the branch services) and between Scripted answers and Live Jev. Switching restarts only what it affects; orders and tasks are kept. Live Jev needs `TYPESAFE_API_KEY` in the environment the stack was started with and uses real quota. With live answers, readings near a threshold go to a person, so more tasks open than the guides describe.

## What each part supports

| Claim | Where |
|---|---|
| Rules decide; the model answers narrow questions | Judgements tab; the review band in [live-checks.md](live-checks.md) |
| People are gated by role and bound to a version | LOG-003 and LOG-004 guides |
| An agent has no authority | LOG-004 |
| Work survives crashes and duplicates | Demo controls; Proof |
| Delegation over A2A matches plain calls | Modes; [benchmarks.md](benchmarks.md) |

All expected results for LOG-001 to LOG-008 are drafts until a reviewer signs them off.
