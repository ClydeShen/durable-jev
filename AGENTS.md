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
