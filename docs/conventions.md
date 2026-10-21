# Code conventions

Goal: from a folder name and a file name alone, a reader knows what the code does. These rules are checked by `pnpm check:conventions`. Existing code that does not follow them is listed in `tools/check-conventions/baseline.json`; the check fails if that list grows, and the migration (roadmap P8) empties it.

## Functions

- Write functions as arrow functions: `export const evaluateRule = (input: RuleInput): RuleResult => { ... }`.
- "Where it works" is the rule, not a dogma. Keep a `function` declaration only when an arrow cannot do the job: generators (`function*`), overloads, a constructor-like function that uses `this`, or code that must be hoisted. Put `// function-declaration: <reason>` on the line above.
- Use a `class` only for something that holds state and a lifecycle together (a service with open database handles, a runtime). Everything else is functions plus plain data.
- One export per concept. Do not hide behaviour in a file called `utils` or `helpers` that is not tied to one concept.

## Folders

```
apps/<service>/src/
  *.rules.ts, *.service.ts, ...   logic, flat in src
  http/           routes, request parsing, response mapping
  persistence/    migrations and repositories (SQLite)
  main.ts         the only entry point; wires everything
packages/<name>/src/   one concept per package; index.ts is the public surface
eval/<tool>/src/       evaluation tools
tools/<tool>/src/      repository tooling
```

- Package and app names are nouns that say what they own: `rule-evaluation` evaluates rules, `rule-engine` is the generic graph/expression machinery, `human-tasks` holds human gates.
- A directory gets a short `README.md` only when its role is not obvious from its name: what it owns, what it does not.

## File names

`<concept>.<role>.ts` in kebab-case. The role suffix says what the file is:

| Role | Holds |
|---|---|
| `.types` / `.schema` | types / Zod schemas, no behaviour |
| `.rules` | business rules |
| `.evaluator` | evaluates a rule or a group of rules |
| `.judge` | a semantic judge (model-backed or scripted) |
| `.service` | a stateful service |
| `.routes` | HTTP routes |
| `.client` | calls another service |
| `.repository` | database reads and writes |
| `.migrations` | table definitions |
| `.runtime` | an agent runtime |
| `.tools` | tools offered to an agent |
| `.model` | pure logic behind a screen or view, or a scripted model |
| `.helpers` | small pure functions for one named concept |
| `.config` | configuration |
| `.app` | builds an HTTP app (no listening) |
| `.cli` | a command-line entry |
| `.errors` | error types |
| `.scenarios` | fault or test scenarios |
| `.server` | a protocol server |
| `.guard` | a limit enforced around a run |
| `.registry` | a registry of tools |
| `.relay` | moves records from one place to another |
| `.bootstrap` | wires and starts a service |
| `.manifest` | the list of processes to run |
| `.fixture` | test data |
| `.test` | tests, next to the code they test |

React files in `apps/web`: `<name>.page.tsx`, `.panel.tsx`, `.view.tsx`, `.node.tsx`, `.component.tsx`, `.hook.ts`, `.styles.css`.

Exceptions by exact name: `index.ts` (public surface of a package), `main.ts` / `main.tsx` (entry point).

Adding a role means changing this table and `tools/check-conventions/check.mjs` together.

## Names

- Variables and functions: `camelCase`, verb first for actions (`evaluateRule`, `buildTimeline`), noun for values.
- Types and components: `PascalCase`. Constants that are real constants: `SCREAMING_CASE`.
- One word, one meaning, everywhere:

| Word | Means |
|---|---|
| evaluate | run rules against a state and return results |
| judge | ask a model (or a script) a semantic question |
| gate | a rule that waits for a person |
| task | a human task a person completes |
| proposal | what the investigation agent suggests; it has no effect until accepted |
| branch | a service that owns a group of rules |
| revision | a version of the case plan |

## Checking

```bash
pnpm check:conventions            # fails if new code breaks a rule
pnpm check:conventions --update   # rewrites the baseline after a migration step
```
