# Delivery documentation

This directory supports Codex/Claude delivery and handoff. It is not application runtime code.
The user's latest instruction takes precedence, followed by `spec.md`, `design.md` and `prd.md`.
Protected files retain their owner-consent restrictions.

## Document ownership

| Owner | Content | Excludes |
|---|---|---|
| `../AGENTS.md` | Agent entry instructions, verification self-check, skill handling | Progress and experiment results |
| `prd.md` | Original protected PRD | Delivery-agent edits |
| `spec.md` | Accepted scope, restrictions and authorizations | Implementation history and result summaries |
| `design.md` | Current internal architecture, contracts and semantics | Experiment transcripts and task status |
| `roadmap.md` | Task IDs, status, dependencies and acceptance conditions | Detailed protocols, reports and cost entries |
| `implementation-notes.md` | Current continuation instructions and unresolved handoff constraints | Chronological discussion or completed-step logs |
| `jev-allowance.jsonl` | Append-only live Jev request reservations | Inferred or reset usage |
| `../docs/branch-strategy.md` | Branch/archive policy and historical reference mapping | Experiment results |
| `../docs/workflow-progress.md` | Milestone evidence index and post-baseline effort ledger | Protocols and detailed observations |
| `../docs/evaluation-plan.md` | Shared experimental method, approved mutations, measurement and custody rules | Per-run results and implementation repair history |
| Experiment documents in `../docs/` | Reproduction, controlled factors, observed evidence and its limits | Delivery discussion and unrelated next-step plans |
| `../docs/demo-guide.md` | Chinese presenter actions and short spoken claims | Architecture explanations and development history |
| `../docs/getting-started.md` | Setup, everyday commands and local operation | Experiment conclusions |
| `../docs/engineering.md` | Code/UI conventions and their enforcement | Task progress |
| `../docs/agent-architecture.md`, `runtime-controls.md` | Source walkthrough and control-to-evidence links | Copies of experimental reports |
| `../docs/baseline.md`, `demo-checkpoint.md` and manifests | Frozen acceptance and restore instructions | Current candidate status |

`../README.md` is the navigation entry. Generated `architecture-graph.md` follows code.
`m0-findings.md` and `tuning-log.md` are bounded historical evidence, not current instructions.

## Update protocol

1. Read the current handoff, scope, relevant design and roadmap task.
2. Update the owning document in place. Use links for supporting facts; summaries must identify
   the evidence's status and must not introduce a second maintained specification.
3. Write accepted decisions and observable behavior. Keep discussion, alternatives considered,
   speculative reasoning and routine repair chronology in Git history rather than current docs.
4. Distinguish current behavior, proposed work and frozen observations. Replace superseded
   present-tense instructions; do not append another paragraph that contradicts them.
5. Preserve task IDs, evidence IDs, hashes, raw results, costs, failures and recovery identities.
   Unknown cost stays unknown. Frozen artifacts are not rewritten to match the candidate.
6. At a milestone archive, update its evidence, roadmap status, handoff and presenter actions.
   Routine steps update only affected owners; do not copy the same change into every file.
