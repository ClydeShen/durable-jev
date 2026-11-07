# Documentation standard

This file owns document boundaries and maintenance rules. The user's latest instruction takes
precedence, followed by `spec.md`, `design.md` and the protected `prd.md`.
README is the navigation entry; application source and schemas remain authoritative for behavior.

## Document ownership

Each Markdown document has one registered responsibility and an event that justifies updating it.

| Document | Type | Owns | Update when |
|---|---|---|---|
| [README](../README.md) | entry | Repository navigation and quick start | An entry, command or document moves |
| [AGENTS](../AGENTS.md) | entry | Delivery instructions, verification self-check and skill handling | Delivery rules change |
| [Documentation standard](README.md) | standard | This register, lifecycle and writing rules | A responsibility or maintenance rule changes |
| [PRD](prd.md) | agreement | Original protected requirements | Owner supplies an approved replacement |
| [Spec](spec.md) | agreement | Accepted scope, restrictions and authorization | Owner changes an agreement |
| [Design](design.md) | design | Current internal contracts, architecture and semantics | Implemented contracts change |
| [Roadmap](roadmap.md) | plan | Task IDs, dependencies and acceptance status | Task acceptance changes |
| [Handoff](implementation-notes.md) | status | Next continuation action and unresolved handoff constraints | Continuation or blocker changes |
| [Engineering](../docs/engineering.md) | guide | Code/UI conventions and enforcement | A convention or gate changes |
| [Getting started](../docs/getting-started.md) | guide | Setup and local operation | Setup or an everyday command changes |
| [Presenter script](../docs/demo-guide.md) | guide | Chinese presenter actions and supported spoken claims | A demonstrated action or claim changes |
| [Agent architecture](../docs/agent-architecture.md) | guide | Technical source walkthrough | Architecture exposed to reviewers changes |
| [Runtime controls](../docs/runtime-controls.md) | guide | Control-to-source/evidence mapping | A control or evidence link changes |
| [Branch strategy](../docs/branch-strategy.md) | agreement | Branch/archive rules and reference mapping | Owner changes strategy or accepts an archive |
| [Evaluation plan](../docs/evaluation-plan.md) | plan | Shared method, mutation definitions and custody | Protocol or approved mutation changes |
| [Progress](../docs/workflow-progress.md) | status | Milestone status, evidence index and effort ledger | Acceptance, evidence availability or effort changes |
| [P1 experiment](../docs/policy-change-experiment.md) | evidence | P1 reproduction, findings and limits | A separately identified P1 run changes evidence |
| [P2/P3 experiment](../docs/gate-change-experiment.md) | evidence | Gate-change reproduction, findings and limits | A separately identified gate-change run changes evidence |
| [Investigation controls](../docs/investigation-experiment.md) | evidence | Offer-strategy and checkpoint controls | A separately identified investigation run changes evidence |
| [Open-question evidence](../docs/open-question-pilot.md) | evidence | Message-only drafts and separate document-tool controls | A separately identified trial/control changes evidence |
| [Jev probe](../docs/jev-probe.md) | evidence | Frozen semantic probe and guarded execution procedure | A correction or identified probe needs documentation |
| [Baseline](../docs/baseline.md) | snapshot | Frozen baseline acceptance and restoration | Restore guidance needs correction; accepted facts stay fixed |
| [Demo checkpoint](../docs/demo-checkpoint.md) | snapshot | Frozen runnable demo and restoration | Restore guidance needs correction; accepted facts stay fixed |
| [Architecture graph](../docs/architecture-graph.md) | generated | Generated package graph | Regenerated from source |
| [M0 findings](../docs/archive/m0-findings.md) | archive | Historical spike evidence for recorded versions | A sourced historical correction is required |
| [Tuning log](../docs/archive/tuning-log.md) | archive | Historical development-set tuning evidence | A sourced historical correction is required |

Non-Markdown artifacts retain their existing contracts: the Jev journal is append-only; evidence
JSON, manifests and protected materials retain their hashes, review status and edit restrictions.
Do not copy consumed quota into current prose; read the authoritative journal.

## Lifecycle

- **Current:** entries, agreements, design, plans, status and guides describe the current contract.
  Replace superseded text in place; a date alone does not make an instruction current.
- **Evidence:** record inputs, source/version, method, observations and limitations. Identify each
  run; a rerun does not overwrite prior raw results or turn draft labels into reviewed facts.
- **Snapshot:** acceptance describes a frozen reference. Correct restore instructions without
  moving refs, replacing acceptance facts or resetting the measurement boundary.
- **Archive:** move completed historical studies to `docs/archive/`, mark their scope, and fix
  incoming/local links. Archive commands are historical observations, not current authorization.
- **Delete:** remove a document when its purpose is obsolete and any still-needed facts already
  have an owner. Update incoming links and this register in the same commit. Git retains deleted
  prose; unique evidence, costs, failures, protected files and recovery identities are preserved.

Age is not the deletion criterion. A frozen recovery record remains useful; an obsolete instruction
must be replaced even if recent. Do not add dated copies, per-step documents or a second index.

## Writing contract

- Start with the document's responsibility and applicable scope. Use present tense for current
  behavior, past tense plus source/run identity for observations, and explicit proposed/pending
  labels for unaccepted work. No unqualified "now", "latest" or "next" outside status documents.
- One fact has one owner. Other documents link to it; brief audience-specific summaries must not
  become independently maintained specifications, counters or result tables.
- Use inline relative links and plain Markdown headings for local references; keep move/rename
  changes and their incoming-link fixes in the same commit.
- Record accepted decisions, executable actions and observable facts. Keep discussion transcripts,
  alternatives considered, speculative reasoning and routine repair chronology in Git history.
- Claims identify their conditions: synthetic/real inputs, scripted/live execution, draft/reviewed
  labels, independent custody and sample denominator where relevant. Unknown costs stay unknown.
- A guide gives steps and expected results. A contract states invariants/interfaces. A plan states
  acceptance conditions. Evidence separates method, observations and limits. Status gives current
  acceptance and the next action; completed-step detail belongs to evidence or the effort ledger.
- Keep stable task/evidence IDs, raw results and hashes. Generated content is changed through its
  generator. All project prose is English except the Chinese presenter script.

## Change checklist

1. Read the current handoff, accepted scope, relevant design and roadmap task.
2. Select the owning file and its update trigger. Update it in place and adjust dependent links.
3. Remove superseded instructions and resolve contradictions against source/agreement/evidence.
   Do not preserve two conflicting paragraphs with a clarification appended below.
4. Check the new text against its sources. Confirm every demonstrated command/action exists and
   every claim has the appropriate evidence status. Semantic accuracy requires review.
5. Run `pnpm docs:check`: it checks this register and local inline links/heading targets, not
   semantic correctness, external URLs or historical command compatibility.
6. Follow project pre-push gates. At accepted milestones synchronize affected evidence, task
   acceptance, handoff and presenter actions; ordinary steps update only affected owners.
