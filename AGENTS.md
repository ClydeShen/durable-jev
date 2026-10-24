# Project handoff

Before continuing work, read `.harness/implementation-notes.md` (current handoff),
`.harness/spec.md` (agreed scope) and `.harness/roadmap.md` (execution order).
The current baseline recovery is documentation revision tag `baseline-2026-10-24-r2` and backup
branch `backup/baseline-2026-10-24-r2`, with the same application source/materials as the original
`baseline-2026-10-24` at `25c7dbb`. See `docs/baseline.md` and its committed manifest. Start future
experiments on a new branch from that tag and count all subsequent adaptations. Do not move
these refs or the earlier demo recovery refs, or resume the shelved refactor automatically.
The distinct pre-cleanup demo recovery instructions remain in `docs/demo-checkpoint.md`.

Post-baseline work is now on `feat/durable-policy-workflow`. Read the current handoff first and
`docs/workflow-progress.md` for stages, cost accounting and new recovery checkpoints. Do not
restart the baseline cleanup or switch back to its maintenance branch.
Every stage archive includes updated handoff/evidence documents and `docs/demo-guide.md`.
Keep the script executable and distinguish current UI actions from report-only demonstrations.

# Delivery agent skills

Installed skills in `.agents/skills/` and `.claude/skills/` are tools for the delivery
agents (Codex and Claude), not project source code or runtime agents.

- Use the installed skills as provided. Do not edit, repair, refactor, format,
  translate, deduplicate, or otherwise modify their files, including their scripts,
  tests, references, and data. Do not change their installation lock to align them
  with project conventions.
- Project engineering requirements apply to project source, not these skills.
  Exclude the installed skill directories from project formatting, linting, type
  checking, dead-code analysis, duplication checks, and application test discovery.
- If a project check scans these skills, fix the project's scan scope instead of
  changing the skills or weakening checks on project source.
- Upstream skill test failures are not project delivery gates. Do not modify skills
  to make their upstream tests pass in this repository.

Follow `docs/engineering.md` for project source conventions. Skill guidance does not
override the user's instructions or authorize changes to installed skills.
