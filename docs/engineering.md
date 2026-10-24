# Engineering conventions

Every convention below is enforced by a tool; none relies on memory or review alone. Each concern
has exactly one owning tool, and each check runs at the earliest stage where it is fast enough.

## When checks run

| Stage | What runs | Time |
|---|---|---|
| Editor | Biome (format and lint as you type), `.editorconfig` | instant |
| Commit ([lefthook.yml](../lefthook.yml), installed by `pnpm install`) | Biome on the staged files; gitleaks on the staged changes (skipped with a notice when gitleaks is not installed); commitlint on the message | about 1 s |
| CI ([.github/workflows/check.yml](../.github/workflows/check.yml)) and `pnpm check` | everything below, plus the scripted replay, the fault scenarios, `pnpm security` and gitleaks over the whole history; a second job builds on Windows and runs the tests, the replay and the fault scenarios there | a few minutes |

`pnpm check` runs, in order:

```
lint → workspace-lint → typecheck → boundaries → architecture graph → protected files → knip → duplication → test
```

## One owner per concern

| Concern | Owner | Deliberately not used for it |
|---|---|---|
| Formatting | Biome formatter, `.editorconfig` | — |
| Readability, complexity, naming, promise handling | Biome | typescript-eslint, Oxlint |
| Types and declared APIs | TypeScript | `noUnusedLocals` / `noUnusedParameters` (Biome owns unused code) |
| Dependency direction, cycles, package entries | dependency-cruiser | Biome `noImportCycles` (it missed type-level cycles that dependency-cruiser found) |
| Architecture picture | dependency-cruiser, generated into [architecture-graph.md](architecture-graph.md) | hand-drawn diagrams |
| Unused files, exports and dependencies | knip | dependency-cruiser `no-orphans` |
| Copy-paste | jscpd | SonarQube or Qlty duplication |
| Workspace manifests | sherif | — |
| Commit messages | commitlint ([commitlint.config.mjs](../commitlint.config.mjs)) | — |
| Secrets | gitleaks | — |
| Tool versions | [mise.toml](../mise.toml) for Node and gitleaks, used locally and in CI; `packageManager` in `package.json` for pnpm | `actions/setup-node` versions, `.nvmrc` |
| Protected files | [eval/materials.lock.json](../eval/materials.lock.json), [.claude/settings.json](../.claude/settings.json), [CODEOWNERS](../.github/CODEOWNERS) (see below) | — |
| Vulnerable dependencies | `pnpm audit` (`pnpm security`) | — |

Run `mise install` once to get the pinned Node and gitleaks; without gitleaks the commit-time
secret scan is skipped with a notice and CI still runs it.

## Protected files

The PRD (`.harness/prd.md`) and everything under `eval/materials/` (policy, rules, test cases,
screening samples, mock data) are source material, not code: an agent must not reshape them to
make a check pass. Three layers, each catching what the previous one cannot:

| Layer | What it does | Covers |
|---|---|---|
| Agent | `.claude/settings.json` denies Claude Code edits to these files, the lock and the protection config itself | everything except `rules.json`, whose Jev questions are tuned with the owner's approval |
| Check | `pnpm check` (and so CI) fails when a protected file no longer matches its hash in `eval/materials.lock.json`; an approved change is recorded with `pnpm materials:lock`, run by a person | all protected files, including `rules.json` and changes made through the shell |
| Merge | `CODEOWNERS` assigns these paths to the owner | effective once branch protection on `main` requires review from code owners |

## Conventions and where they are enforced

| Convention | Why | Enforced by |
|---|---|---|
| File names are kebab-case; React components may be PascalCase | One predictable way to find a file | Biome `style/useFilenamingConvention` ([biome.json](../biome.json)) |
| A package's public API is its `index.ts`, listing named exports; no `export *`, no other re-export files | The entry shows exactly what a package offers; internals can change freely | Biome `performance/noReExportAll`, `performance/noBarrelFile` (allowed only for `packages/*/src/index.ts`) |
| Nothing is exported, depended on or kept that nobody uses | Dead code costs reading time and hides the live paths | knip with `includeEntryExports` ([knip.json](../knip.json)) |
| Deep modules: small interface, real work behind it; no pass-through layers | A layer that only forwards adds a name to learn and nothing to gain (Ousterhout) | Review; the size limits below keep modules from sprawling instead |
| Functions stay readable: cognitive complexity at most 15, at most 80 lines (tests exempt), no nested ternaries, no reassigned parameters | Split by meaning, into named steps, before a function becomes hard to follow | Biome `complexity/noExcessiveCognitiveComplexity`, `complexity/noExcessiveLinesPerFunction`, `style/noNestedTernary`, `style/noParameterAssign` |
| Promises are awaited or explicitly fire-and-forget (`void`) | A forgotten promise loses its error | Biome `nursery/noFloatingPromises`, `nursery/noMisusedPromises` |
| Lint warnings fail the build | A tolerated warning becomes noise nobody reads | `biome check --error-on-warnings` |
| Dependencies point inward: packages never import apps, tools, the eval runner or spikes; apps never import each other | Composition happens at the edges; the core stays reusable | dependency-cruiser `packages-stay-inward`, `apps-are-independent` ([.dependency-cruiser.cjs](../.dependency-cruiser.cjs)) |
| The pure core (`contracts`, `rule-engine`) does no IO | Rules evaluate the same everywhere and are trivially testable | dependency-cruiser `pure-core-does-no-io` |
| The investigation harness knows no business | It can host another agent's helper unchanged | dependency-cruiser `harness-knows-no-business` |
| Another package is imported only through its entry | Its internal files stay private | dependency-cruiser `only-through-package-entry`, plus each `package.json` `exports` map |
| No import cycles, type-only ones included | A cycle hides which module depends on which | dependency-cruiser `no-circular` |
| Production code never imports tests | Test helpers must not leak into runtime | dependency-cruiser `tests-stay-in-tests` |
| A behaviour package's public API states its types: every exported function and public method declares parameter and return types | The API reads without following inference | TypeScript `isolatedDeclarations` in [tsconfig.declared-api.json](../tsconfig.declared-api.json), used by agent-core, agent-transport, agent-harness, human-tasks, store, model-providers, service-kit |
| No name shadows an outer one; variables, functions and types follow camelCase / PascalCase (object and type property names may mirror external data) | A reader never has to work out which of two same-named things is meant | Biome `suspicious/noShadow`, `style/useNamingConvention` |
| The architecture diagram matches the code | A diagram that can drift misleads | `pnpm architecture` generates [architecture-graph.md](architecture-graph.md); `pnpm check` fails when it is stale |
| Commit messages are Conventional Commits; the scope is the workspace package that changed or a cross-cutting area | History says what each change touched | commitlint, at commit time and on every pull request |
| No secret is committed | Keys in history cannot be taken back | gitleaks at commit time and over the whole history in CI |
| Package boundaries are real: a package can only use what it declares | Undeclared imports would break builds elsewhere | TypeScript project references and pnpm's strict `node_modules` |
| Strict types everywhere, tests and the web app included | Types are the first reviewer | `pnpm typecheck`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` ([tsconfig.base.json](../tsconfig.base.json)) |
| No detected production clones across TS/TSX, CSS and maintenance JavaScript | Duplicates drift apart; shared logic gets one owner | jscpd, `threshold: 0`, minimum 50 tokens; tests and generated/dependency files excluded ([.jscpd.json](../.jscpd.json)) |
| Workspace manifests are consistent: one version per dependency, sorted dependencies, no empty sections | Version drift between packages causes subtle bugs | sherif |
| Formatting: 2 spaces, single quotes, no semicolons, 100 columns, LF | No formatting debates or diffs | Biome formatter, [.editorconfig](../.editorconfig), [.gitattributes](../.gitattributes) (LF on checkout on every OS) |
| Works on Windows: file paths from `import.meta.url` go through `fileURLToPath`, and package scripts use no Unix-only shell syntax | `.pathname` gives `/D:/...` on Windows; `VAR=x cmd` does not run in cmd | Biome plugin [lint/no-url-pathname.grit](../lint/no-url-pathname.grit); `shellEmulator: true` in [pnpm-workspace.yaml](../pnpm-workspace.yaml); the Windows CI job |
| PRD, policy, rules and test materials change only with the owner's approval | Agents must not reshape the source material to pass a check | the three layers under Protected files |
| Every small label in the console is one of four kinds from [chips.tsx](../apps/web/src/components/chips.tsx): Badge (a status, filled), Chip (an identifier, monospaced), entity chip (a role or agent, in its colour, clickable to switch or open), Tag (a category or count, neutral). They share one height and baseline | A reader learns the four looks once, and labels line up wherever they meet | Review; the components are the only place these classes are written |
| Every button, input and select follows one size scale: 28 px high (24 px for small) with 13 px text, set by the `--control-*` tokens in [styles.css](../apps/web/src/styles.css). Chips, graph nodes and text links keep their own sizes | Controls line up in any row, and the console stays compact on a projector | Review; buttons take a class (`secondary`, `small`, `danger`, `primary-action`), never their own height |
| Shared spacing comes from `--space-*` and `--panel-inset`; panel headings share the control-height centre line, and drawer fields share `--detail-label-width`. Keep each component's styles together in [styles.css](../apps/web/src/styles.css) | Invisible alignment lines stay consistent across panels and detail sections; long labels wrap instead of moving the value column | Review; refine the shared tokens and owning selector rather than adding a later override |
| Each colour means one thing: status colours for rule results, purple only for a result a change made invalid, teal and rose for a selected rule's upstream and downstream, and agents and roles in colours of their own. The graph legend says what each one means | The audience reads a colour the same way wherever it appears | Review; new meanings get a new token and a legend entry |
| Common actions (close, reset, add, skip to the end, restore the layout) are icon buttons drawn from [icons.tsx](../apps/web/src/components/icons.tsx) through `IconButton`; the action's name is its tooltip and accessible name, and nothing beside it repeats what it does | Familiar icons need no words, which keeps headers and panels compact | Review |
| The console does not explain how to use itself in captions; what a colour or mark means is in the legend, and how to present is in the demo guide | Captions crowd the screen the audience watches | Review |
| The console meets WCAG 2.2 AA: text contrast 4.5:1 and control borders 3:1 in light and dark themes, visible keyboard focus, every action reachable by keyboard (Escape closes a drawer), click targets at least 24 px, live captions announced, no motion when the system asks for reduced motion | Presenters and viewers read it on projectors and screens of every quality; some use a keyboard or a screen reader | The colour tokens in [apps/web/src/styles.css](../apps/web/src/styles.css) were checked pair by pair; an axe-core audit of overview, rule detail, agent card, timeline, the order form and the open legend in both themes reported no violations, except target size for rule nodes while the whole rule graph is zoomed out to fit the screen. Manual, not in CI: re-run it after changing colours or adding controls |
| Each project's build info stays in its `dist/` | Deleting `dist/` must force a rebuild | `tsBuildInfoFile` in each `tsconfig.json` |

Deliberately off:

- `exactOptionalPropertyTypes`: almost every violation was passing `undefined` to an optional
  field of an external library (`fetch`, the Jev SDK, pi-ai, Zod output); satisfying it would add
  conditional spreads that make the code harder to read.
- `isolatedDeclarations` for contracts, rule-engine and logistics: their public types come from
  Zod schemas, and the schema is already the explicit declaration; restating it as interfaces or
  Zod generics would read worse.
- Biome `noMagicNumbers` (most hits are timeouts and test data), `useExportsLast` (layout churn)
  and `useSimplifiedLogicExpression` (rewrites are not clearer).
- TypeScript `noUnusedLocals` / `noUnusedParameters` and `noPropertyAccessFromIndexSignature`:
  Biome already reports unused code, and the index-signature rule is style noise here.

## Other free tools considered

| Tool | What it adds | Decision |
|---|---|---|
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Architecture rules over the import graph | **Adopted** (`pnpm boundaries`) |
| [jscpd](https://unpkg.com/jscpd@5.4.1/README.md) | Copy-paste detection with a threshold | **Adopted** (`pnpm duplication`) |
| [sherif](https://github.com/QuiiBz/sherif) | Zero-config monorepo manifest lint | **Adopted** (`pnpm workspace-lint`) |
| knip | Unused files, exports and dependencies | Already in use |
| [Lefthook](https://recca0120.github.io/en/2026/03/08/lefthook-git-hooks/) | Git hooks with staged-file filtering in one config | **Adopted** (commit-time checks) |
| [commitlint](https://commitlint.js.org/guides/getting-started) | Commit message convention | **Adopted** |
| [gitleaks](https://appsecsanta.com/gitleaks) | Secret scanning | **Adopted** (commit time and CI) |
| type-coverage | Share of identifiers typed `any` | Not adopted: does not support this TypeScript version yet; Biome `noExplicitAny` covers it |
| Stryker | Mutation testing: shows whether tests catch injected bugs | Optional one-off on the rule engine; too slow for every check |
| typescript-eslint | The full set of type-aware rules | Not adopted: Biome covers what this repo needs, and running both doubles configuration; revisit if a type-aware rule Biome lacks becomes necessary |
| [Oxlint](https://oxc.rs/blog/2025-12-08-type-aware-alpha) (type-aware) | Fast type-aware rules such as `no-floating-promises` | Not yet: type-aware mode was still alpha; Biome's `noFloatingPromises` covers the common cases |
| [SonarQube Community / SonarJS](https://www.sonarsource.com/ts) | Code smells, cognitive complexity, security hotspots, history | Optional: needs a server; Biome's cognitive-complexity rule is the same metric (it matches SonarJS) |
| [Qlty CLI](https://docs.qlty.sh/qlty-cli) | Smells, complexity and duplication metrics across languages | Optional: overlaps Biome and jscpd here |
| [Semgrep CE](https://semgrep.dev/docs/faq/overview) | Security and custom pattern rules | Optional: worth adding before production; Semgrep-maintained rules carry their own licence |
| [CodeQL](https://www.infoworld.com/article/3453742/github-makes-codeql-free-for-research-and-open-source.html) | Deep security dataflow analysis | Free for open-source repositories only; needs a licence for private code |
