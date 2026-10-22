# Engineering conventions

Every convention below is checked by a tool in `pnpm check`; none relies on memory or review alone.
A rule that cannot be checked is not listed. `pnpm check` runs, in order:

```
lint → workspace-lint → typecheck → boundaries → knip → duplication → test
```

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
| No import cycles, type-only ones included | A cycle hides which module depends on which | dependency-cruiser `no-circular`, Biome `suspicious/noImportCycles` |
| Production code never imports tests | Test helpers must not leak into runtime | dependency-cruiser `tests-stay-in-tests` |
| Package boundaries are real: a package can only use what it declares | Undeclared imports would break builds elsewhere | TypeScript project references and pnpm's strict `node_modules` |
| Strict types everywhere, tests and the web app included | Types are the first reviewer | `pnpm typecheck`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` ([tsconfig.base.json](../tsconfig.base.json)) |
| Copy-paste stays below 1% of the code | Duplicates drift apart; shared logic gets one owner | jscpd, `threshold: 1` ([.jscpd.json](../.jscpd.json)) |
| Workspace manifests are consistent: one version per dependency, sorted dependencies, no empty sections | Version drift between packages causes subtle bugs | sherif |
| Formatting: 2 spaces, single quotes, no semicolons, 100 columns, LF | No formatting debates or diffs | Biome formatter, [.editorconfig](../.editorconfig) |
| Each project's build info stays in its `dist/` | Deleting `dist/` must force a rebuild | `tsBuildInfoFile` in each `tsconfig.json` |

Deliberately off:

- `exactOptionalPropertyTypes`: almost every violation was passing `undefined` to an optional
  field of an external library (`fetch`, the Jev SDK, pi-ai, Zod output); satisfying it would add
  conditional spreads that make the code harder to read.
- TypeScript `noUnusedLocals` / `noUnusedParameters` and `noPropertyAccessFromIndexSignature`:
  Biome already reports unused code, and the index-signature rule is style noise here.

## Other free tools considered

| Tool | What it adds | Decision |
|---|---|---|
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Architecture rules over the import graph | **Adopted** (`pnpm boundaries`) |
| [jscpd](https://unpkg.com/jscpd@5.4.1/README.md) | Copy-paste detection with a threshold | **Adopted** (`pnpm duplication`) |
| [sherif](https://github.com/QuiiBz/sherif) | Zero-config monorepo manifest lint | **Adopted** (`pnpm workspace-lint`) |
| knip | Unused files, exports and dependencies | Already in use |
| typescript-eslint | The full set of type-aware rules | Not adopted: Biome covers what this repo needs, and running both doubles configuration; revisit if a type-aware rule Biome lacks becomes necessary |
| [Oxlint](https://oxc.rs/blog/2025-12-08-type-aware-alpha) (type-aware) | Fast type-aware rules such as `no-floating-promises` | Not yet: type-aware mode was still alpha; Biome's `noFloatingPromises` covers the common cases |
| [SonarQube Community / SonarJS](https://www.sonarsource.com/ts) | Code smells, cognitive complexity, security hotspots, history | Optional: needs a server; Biome's cognitive-complexity rule is the same metric (it matches SonarJS) |
| [Qlty CLI](https://docs.qlty.sh/qlty-cli) | Smells, complexity and duplication metrics across languages | Optional: overlaps Biome and jscpd here |
| [Semgrep CE](https://semgrep.dev/docs/faq/overview) | Security and custom pattern rules | Optional: worth adding before production; Semgrep-maintained rules carry their own licence |
| [CodeQL](https://www.infoworld.com/article/3453742/github-makes-codeql-free-for-research-and-open-source.html) | Deep security dataflow analysis | Free for open-source repositories only; needs a licence for private code |
