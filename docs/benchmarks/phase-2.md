# Phase 2 benchmarks

Same caveat as Phase 1: measured in a GPU-less container (SwiftShader software GL, 4 vCPUs),
so render times say nothing about R5. Streaming, worker, CPU and memory numbers are real.
Raw data: `docs/benchmarks/phase-2-container.json` (`BENCH=1 BENCH_OUT=... npx playwright
test bench`). Real-GPU numbers: open `?bench=1` on the target machines.

## Container results (2026-09-28, render distance 4, seed "hypercraft", 3 workers)

| Metric | Phase 1 test terrain | Phase 2 terrain |
|---|---|---|
| Spawn column ready | 1.1 s | 3.5 s (includes the test garden's flat-site search in every worker) |
| Fully streamed | 5.0 s (184 columns) | 9.0 s (196 columns) |
| Worker time per column: generate / light / pack | 27–34 / 7 / 3–6 ms | **33 / 14 / 8 ms** |
| Move 2 chunks ana | 72 columns, 1.1 s | 84 columns, 1.5 s |
| Rotate the slice 90° (XW) | 47 columns, 0.8 s | 56 columns, 1.6 s |
| CPU memory (brick-sparse chunks) | 63 MB | 100 MB |
| GPU brick pools (resident: block / light bricks) | 97k / 43k, 84 MB | 154k / 84k, 147 MB* |
| Main-thread logic per frame (steady) | 0.10 ms avg, 0.20 p95 | 0.16 ms avg, 0.30 p95 |
| Ray steps per pixel at 360p (avg / p95 / max) | 22–29 / 54–66 / 87–113 | 20–23 / 44–51 / 76–85 |

\* This run triggered two pool regrows, because the initial pool size was estimated for the
sparse Phase 1 terrain. The estimate is now ~850 bricks per resident column, so a fresh
start allocates the right size once.

### What changed and why

* **Terrain is busier.** Real biomes, caves, ores, lakes and vegetation make about 790
  non-uniform 4⁴ block bricks per column, against about 530 before. GPU and CPU memory grow
  accordingly. Palette-compressed bricks (8-bit indices into a per-brick palette) would
  roughly halve block-pool memory; they are the planned fix if hardware numbers show
  pressure.
* **Generation is heavier but optimised.** The first version of the Phase 2 generator took
  124 ms per column in Node. Profiling found:
  * a per-voxel hash for the dithered deepstone boundary (24% of the time);
  * cave-field interpolation (20%);
  * slow property lookups on the dictionary-mode block-id table `B` inside voxel loops.
  Segmented vertical fills, row-shared cave-field interpolation, per-column cave biomes and
  hoisted ids brought it to about 44 ms in Node and **33 ms in the worker build**.
* **Ray steps went down slightly.** Surface terrain is mostly solid below the surface and
  open above it. Empty-space skipping handles open air, and rays hit terrain early.

### Software GL render times (reference only)

| View | 180p | 360p | 720p |
|---|---|---|---|
| Axis-aligned | 625 ms | 2 430 ms | 8 914 ms |
| XW 30° | 742 ms | 2 618 ms | 9 865 ms |
| XW 45° + ZW 45° | 686 ms | 2 252 ms | 8 896 ms |
