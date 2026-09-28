# Phase 1 benchmarks

## Read this first

These numbers were measured in a cloud container **without a GPU**: WebGL2 ran on
SwiftShader, Chrome's CPU software rasteriser, on 4 vCPUs. Render times from that setup are
roughly three orders of magnitude slower than a real GPU and say nothing about R5. What *is*
meaningful from the container:

* GPU-independent renderer cost (ray steps per pixel);
* streaming/generation throughput, main-thread CPU cost and memory (these run on the CPU either
  way).

**R5 (60 fps at 360p on an integrated GPU, 30+ fps at 720p on a mid discrete GPU) is not yet
verified on hardware.** Run the in-game benchmark on the target machines:

```
npm run build && npm run preview     # then open http://localhost:4173/?bench=1
```

It streams the world, then renders four scenarios (axis-aligned, XW 30°, XW 45° + ZW 45°,
spinning + tilting) at 360p and 720p for four seconds each. It reports fps, average/p95 frame
time, GPU time (when the browser exposes `EXT_disjoint_timer_query_webgl2`) and ray steps.
Results show on screen, in the console and in `window.__hcBench`. Frame rates are capped by
vsync, so read the GPU column for the uncapped cost.

## Container results (2026-09-28, render distance 4, seed "hypercraft", 3 workers)

Raw data: `docs/benchmarks/phase-1-container.json` (produced by
`BENCH=1 npx playwright test bench`).

### Streaming and memory

| Metric | Value |
|---|---|
| Spawn column ready (physics starts) | 1.1 s |
| Fully streamed (184 columns = 1 472 chunks = 96 M voxels) | 5.0 s |
| Worker time per column (16×128×16×16): generate / light / pack | 27–34 ms / 7 ms / 3–6 ms |
| Moving 2 chunks along the hidden axis (ana) | 72 new columns, settled in 1.1 s |
| Rotating the slice 90° (XW) | 47 new columns, settled in 0.8 s |
| CPU memory (brick-sparse chunks, 184 columns) | 63 MB (~0.34 MB/column) |
| GPU brick pools (97k block bricks + 43k light bricks resident; allocated capacity) | 84 MB |
| Main-thread logic per frame (physics, streaming, light, uploads, picking, env) | 0.10 ms avg, 0.20 ms p95 (steady state) |
| Engine allocations per frame (V8 sampling heap profiler) | none (only the browser's rAF bookkeeping, ~0.4 KB) |

### Renderer (GPU-independent)

| View (360p internal) | Avg ray steps / px | p95 | max |
|---|---|---|---|
| Axis-aligned | 22.1 | 54 | 87 |
| XW 30° | 28.9 | 66 | 109 |
| XW 45° + ZW 45° | 26.7 | 64 | 113 |

A "step" is one iteration of the hierarchical DDA (a whole 16⁴ chunk, a 4⁴ brick or one
voxel). The step cap is 256. Uniform chunk/brick skipping keeps the sky and open air cheap:
most sky rays leave the world in under 10 steps.

### Software GL render times (for reference only)

| View | 180p | 360p | 720p |
|---|---|---|---|
| Axis-aligned | 843 ms | 2 917 ms | 11 072 ms |
| XW 30° | 1 115 ms | 3 783 ms | 14 473 ms |
| XW 45° + ZW 45° | 935 ms | 3 570 ms | 13 604 ms |

Cost scales linearly with pixel count, as expected for a per-pixel ray marcher.

### Rough GPU estimate (to be replaced by hardware numbers)

At 360p there are 230k pixels × (~25 DDA steps with cached chunk/brick entries ≈ 1.5
dependent fetches each, plus ~45 fetches of shading: 8 light/AO samples, texture, block
info), about 20 M texel fetches per frame. Even at a pessimistic 5–10 G fetches/s for an
integrated GPU with incoherent access, that is 2–4 ms, which fits R5's 16.7 ms budget with
room for the adaptive scaler. This is an estimate, not a measurement.
