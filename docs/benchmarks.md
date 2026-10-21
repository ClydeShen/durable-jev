# Benchmarks

Results of the no-model comparisons (B3 and B4). They run the real code with scripted answers, so they cost nothing and repeat exactly. The model comparisons (B1 with a structured-output model, B2 with a generative agent) need an NVIDIA key and are not done yet; see [live-checks.md](live-checks.md) for the Jev measurements that exist.

Run them with:

```bash
pnpm --filter @durable-jev/eval-benchmarks b3     # recovery after a crash, in-memory vs Pi Durable
pnpm --filter @durable-jev/eval-benchmarks b4     # native HTTP vs A2A overhead
```

Reports are written to `var/reports/`.

## B3: recovery after a crash, in-memory vs Pi Durable

B3 recovery after a crash: scripted model, same loop and tools, 5 trials per fault point and runtime.

| Runtime | Killed | Recovered to the same proposal | Outcomes | Duplicate writes (completed) | Tool runs repeated (mean) | Recovery time p50 |
|---|---|---|---|---|---|---|
| in-memory | before the first tool finished | 5/5 | completed | 0 | 1.0 | 1668.90 ms |
| in-memory | after the carrier listing finished | 5/5 | completed | 0 | 2.0 | 1794.64 ms |
| in-memory | after one candidate check finished | 5/5 | completed | 0 | 3.0 | 1775.68 ms |
| in-memory | inside the write that records the proposal | 5/5 | completed | 0 | 5.0 | 1782.72 ms |
| Pi Durable | before the first tool finished | 5/5 | completed | 0 | 1.0 | 1953.92 ms |
| Pi Durable | after the carrier listing finished | 5/5 | completed | 0 | 1.0 | 1806.66 ms |
| Pi Durable | after one candidate check finished | 5/5 | completed | 0 | 1.0 | 1987.20 ms |
| Pi Durable | inside the write that records the proposal | 5/5 | completed | 0 | 1.0 | 1766.70 ms |

A duplicate write is a proposal recorded more than once. The in-memory runtime has nothing to resume, so its recovery is a fresh submission of the same request. "Tool runs repeated" counts tool attempts beyond a crash-free run. Recovery time includes starting a new process.

What it shows:

- Both runtimes recover to the same proposal in every trial. With a scripted model and tools that guard their own writes, persistence is not needed for correctness.
- The difference is repeated work. Pi Durable reads finished tool results back and repeats only the call that was cut off (1 attempt). The in-memory loop starts over, so what it repeats grows with how far the run had got (1, 2, 3 and 5 repeated attempts). With a real model each repeated step is another paid call, and a restarted run can take a different path; this benchmark does not measure that.
- No duplicate writes in either case, because the crash here comes before the write and the write is guarded by an operation id. The case where the write succeeds and the process dies before answering is fault F02 (`pnpm faults`), where both rely on the same business-side guard.
- Recovery time is dominated by starting a new process (about 1.7 to 2.0 s), so it does not separate the runtimes.
- Pi Durable has no restart limit; this project added one outside Pi's store (`docs/runtime-controls.md`). That is part of the cost side of H3.
- Five trials per cell with a deterministic model repeat the same outcome; they say the behaviour is stable, not that it holds for every model.

## B4: native HTTP vs A2A

B4 protocol overhead: 200 warm calls per side plus the first call, same machine, no model.

| | First call | Warm p50 | Warm p95 | Warm mean |
|---|---|---|---|---|
| Native HTTP | 70.45 ms | 1.89 ms | 3.10 ms | 2.06 ms |
| A2A | 19.95 ms | 4.10 ms | 6.07 ms | 4.38 ms |

A2A adds 2.21 ms at p50 (2.2x).
Identical results over both protocols: 201 of 201 calls.

What it shows:

- Over A2A the same branch service returns identical results in every call, and the coordinator needed no change to switch (`apps/coordinator/src/branch-protocol.test.ts`, H4).
- The overhead is a few milliseconds per call on one machine. Next to a person-in-the-loop flow or a model call (median 140 ms for Jev) it is small; for a chatty fast service it would matter.
- This is a loopback measurement with a light evaluation. Network distance and larger payloads will add to both sides.
