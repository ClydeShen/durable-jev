# Project handoff

Read [.harness/README.md](.harness/README.md) for document ownership, then the current
[handoff](.harness/implementation-notes.md), [scope](.harness/spec.md), relevant
[design](.harness/design.md) and [roadmap task](.harness/roadmap.md).

[docs/branch-strategy.md](docs/branch-strategy.md) owns working/archive branch policy and
recovery-reference mappings. Follow it rather than older branch instructions in Git history.
[docs/workflow-progress.md](docs/workflow-progress.md) owns milestone status and effort records.
Frozen restoration instructions belong to [docs/baseline.md](docs/baseline.md) and
[docs/demo-checkpoint.md](docs/demo-checkpoint.md).

Update documentation in its owning file; use links instead of repeating specifications or results.
Keep current instructions free of discussion transcripts, reasoning chronology and superseded plans.
Every accepted milestone archive includes synchronized evidence and an executable
[docs/demo-guide.md](docs/demo-guide.md), distinguishing UI actions from report demonstrations.

# Verification self-check

When planning and writing code, ask: "How do we make this change fully verifiable?"

- Before implementation, define observable acceptance criteria, what must remain unchanged,
  and the smallest checks that could expose a wrong implementation.
- Prefer existing checks and focused regression tests. Include relevant failure paths, not
  only successful examples; keep verification proportional to the change's risk.
- After implementation, inspect the final diff and report reproducible checks, observed results
  and remaining gaps. Distinguish archive integrity, scripted behavior and actual runtime/model
  evidence; passing one does not establish the others.
- Treat this as a standing self-check, not a demand for a new framework or exhaustive proof.
  Do not claim full verification where evidence is missing. Existing pre-push gates still apply.

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
