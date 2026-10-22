/**
 * Architecture boundaries, checked by `pnpm boundaries`. Dependencies point inward: apps, tools and
 * the eval runner compose packages; packages never reach outward, and the pure core (contracts,
 * rule engine) does no IO. Cross-package imports go through the package entry only.
 */
const ioModules = '^(express|better-sqlite3|pino|node:(fs|net|http|https|child_process))$'

/** A workspace package, whether the import resolved to its folder or only to its name. */
const workspacePackage = (names) => [`^packages/(${names})/`, `^@durable-jev/(${names})$`]

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Import cycles hide the real dependency direction; invert one edge or split the module.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'packages-stay-inward',
      severity: 'error',
      comment: 'A package must not depend on an app, tool, the eval runner or a spike.',
      from: { path: '^packages/' },
      to: { path: '^(apps|tools|eval/runner|spikes)/' },
    },
    {
      name: 'apps-are-independent',
      severity: 'error',
      comment: 'Apps share code through packages, never by importing each other.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'pure-core-does-no-io',
      severity: 'error',
      comment:
        'contracts and rule-engine are pure: no storage, servers, logging or other packages with IO.',
      from: { path: '^packages/(contracts|rule-engine)/src/' },
      to: {
        path: [
          ioModules,
          ...workspacePackage(
            'store|service-kit|agent-transport|agent-harness|agent-core|logistics|model-providers',
          ),
        ],
      },
    },
    {
      name: 'harness-knows-no-business',
      severity: 'error',
      comment:
        'The investigation harness is generic; business tools are handed to it by logistics.',
      from: { path: '^packages/agent-harness/src/' },
      to: { path: workspacePackage('contracts|logistics|agent-core|rule-engine') },
    },
    {
      name: 'only-through-package-entry',
      severity: 'error',
      comment: 'Import another package through its entry (index.ts), not its internal modules.',
      from: { path: '^(packages|apps|tools|eval)/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/',
        pathNot: ['^packages/$2/', '^packages/[^/]+/(dist/index\\.(js|d\\.ts)|src/index\\.ts)$'],
      },
    },
    {
      name: 'tests-stay-in-tests',
      severity: 'error',
      comment: 'Production code must not import test files.',
      from: { pathNot: '\\.test\\.tsx?$' },
      to: { path: '\\.test\\.tsx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.typecheck.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
  },
}
