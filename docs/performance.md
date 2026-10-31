# Phase 6 performance sample — 2026-10-31

Reproduce with `npm run profile`. This is development tooling, with no player time-skip controls. It runs a
deterministic full-campaign engine sample, then a separate real 3× browser sample across a month boundary with
the 3D map and Economy panel. Results and a screenshot are written under ignored `artifacts/`.

Machine: Apple M4, macOS, Node v24.14.0, headless Chromium 156.0.8078.4, 1600×900 viewport. These are a short
sample on one machine and a hosted map connection, not universal performance guarantees.

| Engine work | Samples | Median | p95 | Maximum |
|---|---:|---:|---:|---:|
| Ordinary hourly tick | 16,813 | 0.0023 ms | 0.0173 ms | 1.136 ms |
| Daily settlement | 707 | 0.0343 ms | 0.0867 ms | 1.080 ms |
| Month close | 24 | 0.1253 ms | 0.3132 ms | 1.162 ms |
| Full end-state serialization | 10 | 13.950 ms | 15.912 ms | 15.912 ms |

The end snapshot is 3,472,194 bytes (~3.31 MiB), with bounded histories. Timing probes use `performance.now()`
outside the engine and do not enter saved state or consume randomness. Node timings exclude React, MapLibre,
IndexedDB and the browser's rendering pipeline.

Browser sample: **12 game hours in 12.001 real seconds**, 636 frames, p95 frame interval **33.4 ms**, maximum
66.7 ms, nine long tasks with a 62 ms maximum, and 57 ms from a scripted Objectives click to visible content.
The sample crosses a month close and ends with 13 monthly reports. The script allows 15 seconds for network
idle after opening the map; network idle was **not** reached, so hosted tile activity was still possible. Player
saves are disabled in this isolated tab; serialization cost is measured separately above.

A first sample begun during cold map loading advanced 10 hours in 12 seconds and saw an ~817 ms maximum frame
interval (~821 ms maximum long task). The fixed-frame clamp correctly slowed game time rather than catching
up. Hosted map/rendering work, rather than the deterministic economy tick, is the visible limitation here. This
pass does not introduce a worker or change map quality without evidence that the engine is the bottleneck.

Full browser tests use two workers. A five-browser WebGL run concurrent with build/unit work starved the timing
test (clock remained at its opening hour within the 10-second poll); the complete two-worker run passes. Keep
performance sampling separate from test/build load and distinguish cold map loading from settled play. A long
human campaign still needs observation for usability, memory pressure and difficulty (`playtesting.md`).

## 5× sample (D-081) — 2026-11-01

`npm run profile -- --speed 5` (the script now opens the Info views rail before choosing the Economy panel; it had broken
when the rail became collapsible). Same machine, but this headless Chromium rendered the map in software and its tiles
never reached network idle, so both speeds were frame-bound this time: **3×: 9 game hours in 12.2 s** (p95 frame 333 ms)
and **5×: 15 game hours in 12.4 s** (p95 frame 433 ms, 42 long tasks, maximum 430 ms). Each reached 75% of its nominal
rate. 5× cost no more per frame than 3×, and the frame clamp slowed game time instead of catching up. Engine work at 5× is
~1.7 hourly ticks per real second (median 0.002 ms each). On a GPU-backed desktop browser the 3× sample earlier ran at full
rate. A frame-bound browser simply plays 5× below its nominal rate.
