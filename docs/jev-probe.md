# Bounded live Jev semantic probe

Three real Jev requests succeeded on 2026-10-24. This is a hybrid integration probe of three
previously used development inputs, not blind evaluation, independent policy generation or a
fully live agent workflow. All other judgments remain scripted. NVIDIA was not invoked.

## Observations

| Input | Real Jev result | Business branch after substituting that answer | Scripted comparison |
|---|---|---|---|
| P2 corrected safety data sheet, R10 | Match probability 0.88 | R10 PASS; R13 waits for compliance review | Probability 0.94; same branch |
| P3 damaged packaging, R18 | damaged_packaging, probability 0.99 | R18 FAIL; R21 waits for warehouse work with newPackagingId, photoRef and inspectionReportRef | Same branch and evidence requirements |
| P3 intact packaging, R18 | no_risk, probability 1 | R18 PASS; R21 NOT_APPLICABLE; no selected task | Same branch |

All three responses were HTTP 200, model `jev-1.14.0`. Reported usage totals 1,101 input and
120 output tokens. Client-measured durations were 224, 159 and 111 ms; these three samples are
not a latency benchmark. Price and active human minutes are unknown, not zero. The P2 probe
does not complete the approval chain, and none of these probes establishes whole-flow dispatch
safety, accuracy, authoring savings or an advantage over a fixed workflow.

The committed [raw evidence](jev-probe-evidence.json) contains the complete frozen plan and
report, including inputs, source/candidate hashes, answer substitution, task outcomes and quota
reservations. Its source commit is `6c812d9` (clean at preparation). The original plan SHA-256 is
`ec4cc071eeb49ce13adf27aaa0bf5d596fdb0c46c536f2da6a5e5b886f0d3a48`.
Reconstruct its bytes with `JSON.stringify(evidence.plan, null, 2) + '\n'` to check that hash.
Absolute run paths in the evidence are original local artifact locations, not portable links.

## Code and allowance

Three small files in the existing `eval/runner/src/` hold the request allowance, selected case
observations and prepare/live entrypoint. One test file covers the allowance. No package,
dependency, shared runtime, protected material, UI or installed delivery-agent skill changed.

`.harness/jev-allowance.jsonl` is the authoritative append-only reservation journal. Read consumed
reservations there. Unused slots cannot transfer between steps. Reserve under an exclusive file lock
and fsync before transport; failed, timed-out or uncertain requests retain their reservation.
Missing, malformed, locked or exhausted journals fail closed. SDK retries and automatic HTTP
redirects are disabled. The journal contains request-body hashes, not credentials or headers.

This is a local guard on this evaluation entrypoint, not a provider-wide quota or protection of
every application's model call. Use one authoritative checkout for live work. Never reset or
roll back the journal to recover allowance when restoring older code; reconcile current usage
first. A backup clone is not a new budget. Do not run unrestricted live replay or model checks.

## Safe preparation and recovery

`pnpm eval:jev-probe prepare` is offline-only and may be repeated. It copies materials under
ignored `var/reports/`, prepares versioned P2/P3 candidates and freezes three inputs, scripted
controls and executable hashes. CI runs preparation and fake-transport tests only.

Live execution requires explicit live mode, the matching plan hash, the same clean source commit,
unchanged materials/executables, an unused run directory and enough remaining allowance. It
stops on the first error without retry and retains partial evidence and consumed reservations.
Do not automatically rerun the archived batch. Prepare any later bounded selection against the
current journal and the authorization limits in spec section 17.

Recovery references are maintained in [branch-strategy.md](branch-strategy.md). The presenter
script shows the committed report without network requests. Current work is tracked in
[workflow-progress.md](workflow-progress.md); this frozen probe is not a running quota summary.
