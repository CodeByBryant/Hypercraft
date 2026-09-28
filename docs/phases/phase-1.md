# Phase 1 report: Engine

Status: **complete, awaiting approval** (R3). Screenshots: `docs/screenshots/phase-1/`.
Benchmarks: `docs/benchmarks/phase-1.md`.

## R6 reference views

Rendered by `tests/e2e/views.spec.ts` at 360p internal (640×360, upscaled to 1280×720),
hovering 3 blocks above spawn at (0.5, y, −3.5, 0.5), pitch −14°, looking toward the engine
test garden.

### 1. Axis-aligned (hidden axis = +W) — `1-axis-aligned.png`

Voxels read as **cubes**. Grass blocks are cubes with grass-fringed sides. The stone floor
tiles are squares with outlines on every tile edge. The 3×3×3 marker sculpture is a regular
cube stack. Slabs and stairs show half-cube profiles. The water pool is a flat box with a
translucent surface. No outline appears along the hidden axis (its `g_W = 0`).

### 2. XW tilt 30° — `2-xw-30.png`

Voxels read as **stretched boxes (prisms with rectangular bases), not cubes**. Along the
screen's right axis, now `cos30·X + sin30·W`, every block is cut into boxes of varying width:
the marker sculpture shows full-width columns alternating with thin slivers where the slice
crosses a W boundary, and floor tiles have irregular widths. Terrain steps sit at positions
set by both X and W. This matches the analytic cross-section (a box up to `1/cos 30° ≈ 1.155`
long, or a short corner cut).

### 3. XW 45° + ZW 45° — `3-xw45-zw45.png`

Voxels read as **triangular, quadrilateral, pentagonal and hexagonal prisms**. Grass tops are
triangles and hexagons, and the terrain forms prism columns with slanted faces. Tree canopies
(4D balls) appear as partial round blobs, some floating with their trunk out of the slice,
which is correct for 4D. The selection outline (CPU polytope) traces a hexagonal prism. With
the hidden axis `(−0.71, 0, −0.5, 0.5)`, this is exactly the plane ∩ cube polygon extruded
along Y.

None of the tilted views shows cubes, so there is no slice-math bug. The maths is also
unit-tested (cube → 12 edges/8 vertices; XW 30° → box with 1/cos30 edges; compound → hexagonal
prism 12 vertices/18 edges; triangular prism 6/9).

## What works

* **Vite + TypeScript**, no UI framework, shaders in `.glsl` files imported as strings.
* **Chunked, streamed, infinite 4D world**: 16⁴ chunks, 8-chunk columns (Y 0..128), toroidal
  window, 4D slice-aware priority (in-slice distance + stretched hidden-axis distance),
  deterministic worker generation with a job queue.
* **GPU layout**: chunk table + brick table + independent block/light brick pools (documented
  in `docs/gpu-layout.md`); 4D DDA across chunk boundaries; **empty-space skipping** at chunk
  (16⁴) and brick (4⁴) level.
* **Rendering (R1)**: exact facet hits in the view hyperplane; outlines follow the true
  cross-section polytope; P toggles the cross-section wireframe (facet-axis tints, axis-coloured
  edges, CPU polytopes of nearby cells); selection outline is the true polytope.
* **Shapes**: per-block shape id with analytic sub-voxel tests: slabs (top/bottom), stairs and
  ladders (6 facings including ±W), torches, posts, plants (diagonal sheets), fluid levels.
* **Transparency**: glass, ice, portal (translucent, bounded at 6 pass-throughs); leaves,
  ladders, plants (cutout); water with surface and depth absorption; lava as emissive.
* **Fluids**: water and lava sources/flows with a 4D rule (down first, then ±X/±Z/±W), falling
  water, drying up, infinite-water rule, lava + water → obsidian/cobblestone, tick budget.
* **Physics**: 4D hyperbox, axis-separated substepped collision against shape boxes, gravity
  on the realm's axis, jump (1.25 blocks), swim, climb, sprint, sneak with edge protection in
  all horizontal 4D directions, step-up for slabs/stairs, creative flying (double-tap Space),
  spectator noclip.
* **Lighting**: sky + block light, 4D BFS over 8 face neighbours, worker column light, seam
  propagation across columns, removal/re-propagation on edits; smooth lighting + AO at the hit
  facet.
* **Environment**: day/night with a 4D sun and moon, 8 moon phases, 4D star field, clouds in a
  hyperplane, weather (rain, snow, thunder with lightning, phase storms), biome-tinted sky and
  fog, precipitation masked by sky exposure.
* **Fairness (R2) groundwork**: hidden-axis compass, hidden-axis radar (walls, floor lava,
  water, drop-offs in the plane of right × hidden), screen-edge warnings for lava along ±h,
  and a "blocked" edge hint when kata/ana movement is obstructed.
* **Debug (F3)**: fps, frame/CPU/GPU ms, internal resolution, ray steps (avg/max via async
  readback), position (xyzw), chunk, hidden/forward/right vectors, biome, light levels,
  columns/chunks, worker queue and timings, GPU pool usage, uploads, light queue, fluids,
  time/moon/weather, target block and facet.
* **Performance plumbing (R5)**: adaptive resolution scaler (GPU timer when available) with
  manual override (`O`, `?res=`); allocation-free engine loop (verified with the V8 heap
  profiler); `?bench=1` in-game benchmark.
* **Tests/CI**: 56 unit tests (noise, hashing, 4D camera, cross-sections, edge rates,
  registry, texture gen, world gen, biome selection, chunk storage, light BFS/seams, fluids,
  physics, picking); Playwright smoke test (boot, generate, walk, mine, place, rotate,
  screenshot); R6 view capture; benchmark spec; `scripts/ci.sh` + GitHub Actions workflow.
* **Docs**: architecture, GPU layout, 4D rendering, data formats, how-tos (block, biome,
  realm; planned interfaces for mob and structure).

## What is broken or unverified

See `KNOWN_ISSUES.md` for the full list. The important ones:

* **R5 is unverified on real hardware**: this environment has no GPU. The in-game benchmark
  exists for that.
* **GPU memory is heavy**: about 84 MB of brick pools at render distance 4.
* **No saves**: edits survive unloading only for the session.
* **Survival is shallow**: mining is instant, and there is no inventory, health or damage
  (Phases 3–4).

## Next (Phase 2, pending approval)

Surface terrain: 4D noise climate with weirdness/elevation/ana-bias fields, biomes (8 first,
then all 24) with their blocks and plants, caves (worm tunnels, hyper-caverns, Ana Sheets,
ravines), ore veins by depth, trees and plants, rivers/lakes/oceans; replace the test garden.
