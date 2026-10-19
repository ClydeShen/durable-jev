# Policy v1 (fictional)

This is a fictional internal transport policy for the proof of concept. It does not reflect the licensing, safety or customs rules of any real country. Every threshold lives in `mock-policy-parameters.json`; a missing parameter fails configuration validation, and no model may guess one at runtime.

The machine-readable form is `rules.json`. The table below is generated from it by `pnpm --filter @durable-jev/eval-runner policy:render`, and a test fails if this file is out of date. Edit `policy-v1.template.md`, `rule-descriptions.json` or `rules.json`, never this file.

## How to read a rule

- **Scope**: `order`, `cargoItem` (evaluated once per item) or `leg` (once per transport leg).
- **Status**: PASS, FAIL, UNKNOWN, NOT_APPLICABLE, ERROR, BLOCKED_DEPENDENCY, WAITING_HUMAN or INVALIDATED.
- **Prerequisites**: a rule whose prerequisites have not passed is BLOCKED_DEPENDENCY. Only a human gate itself is WAITING_HUMAN; anything that depends on it, directly or nested, is blocked.
- **Applies when**: if the condition does not hold, the rule is NOT_APPLICABLE. If the condition is still undecided, the rule is blocked.
- **Condition rules** (IDs with a suffix, such as `R04-COLD`) are PASS when the situation holds and NOT_APPLICABLE otherwise. They never FAIL.
- **Facts vs gates**: R18 and R19 record what was found (risk, excursion) as an observed value; their gate only says the check was done. Whether rework is needed is decided by the condition rules.
- **Combinators**: AND fails on any FAIL and is blocked while anything it needs is pending. OR passes on any PASS. NOT never turns UNKNOWN into PASS. ALL/ANY over an empty set is UNKNOWN, never a pass. NOT_APPLICABLE parts are ignored.

## Rules

{{RULES_TABLE}}

## Human tasks

- An approval records a decision; an operation records a field action with the listed evidence fields. Clicking approve never completes an operation.
- Every task is bound to the case revision, entity versions and an input fingerprint. A change to what the task covers supersedes it, whether it was open or already decided, and creates a new task. Old decisions are never reused.
- Only the required role may act. Expired, cancelled and superseded tasks are final.
- When an automated semantic judgement is uncertain, the rule escalates to the named reviewer, whose approval passes it and rejection fails it.

## Mixing matrix

See `decision-tables/mixing-matrix.json`. A shipment's tokens are its cargo categories plus `CONTROLLED:<class>` for each controlled class. Any forbidden pair present fails R12. An approval cannot override it; the shipment must be split or the cargo changed.

## Parameters

{{PARAMETERS_TABLE}}
