# GitHub Copilot instructions

## Commit messages

When generating a commit message, output only one Conventional Commit header in
the form `type(scope): subject`.

- Keep the complete header at 100 characters or fewer.
- Use one of these types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
  `refactor`, `revert`, `style`, `test`, or `tune`.
- Use one of these scopes: `agent-core`, `agent-harness`, `agent-transport`,
  `contracts`, `human-tasks`, `logistics`, `model-providers`, `rule-engine`,
  `service-kit`, `store`, `agent`, `coordinator`, `web`, `launcher`,
  `rule-authoring`, `eval`, `rules`, `harness`, `faults`, `lint`, `types`,
  `deps`, or `ci`.
- Do not invent scopes such as `skills`.
- For installing or updating agent skills under `.agents` or `.claude`, use
  `chore(deps): add <skill-name> skill`.
