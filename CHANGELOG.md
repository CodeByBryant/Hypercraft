# Changelog

## 0.1.1 — Controls, seeds, worlds, touch (2026-09-28)

### Changed
- WASD is movement only; the arrow keys now turn the camera (yaw/pitch).

### Added
- Title screen with a live 4D demo world behind it; world list (play, export, delete,
  import); create-world screen with seed field, random seed, seed ideas, game mode,
  difficulty, hardcore and cheats flags.
- Seeds: integers are used as-is, any other text is hashed.
- IndexedDB saves: edited columns (gzip-compressed, block-name palette so saves survive
  content changes), player position/orientation/mode, time, weather and hotbar; autosave
  every 30 s and on pause/hide/quit; `.hcworld` export/import.
- Touch controls: floating move stick, drag-to-look, tap/long-press to place/break,
  two-finger slice rotation, button cluster; touch-specific HUD layout.
- Settings screen (FOV, sensitivity, render distance, internal resolution, outlines,
  vignette, pixelated upscaling, invert Y, touch controls) and pause menu.
- Tests: seed parsing, column codec round-trip and palette remap, e2e world
  create → edit → save → reload, touch layout.

## 0.1.0 — Phase 1: Engine (2026-09-28)

### Added
- Vite + TypeScript project; shaders as `.glsl` strings; no UI framework.
- 4D math: vectors, seeded hashing/PRNG, simplex noise (2D/3D/4D, fBm), upright 4D camera
  frame (yaw, pitch, slice tilts, world-plane rotations, snap to axes), tesseract/box
  cross-section polytopes and analytic edge rates.
- Data-driven content registries (blocks, shapes with orientation variants, procedural 16³
  textures, biomes, realms) with validation and GPU tables.
- Brick-sparse 16⁴ chunk storage, 8-chunk columns, infinite X/Z/W with a toroidal window.
- Web Worker generation pool (deterministic per seed), slice-aware streaming priority,
  column-local light in workers.
- Phase 1 Surface generator: 4D heightfield, 4 test biomes, 4D cheese caves with lava below
  y 10, ore blobs, 4D-ball trees, tall grass, frozen water, and the engine test garden.
- GPU layout: chunk table, brick table, block/light brick pools, surface (biome colour) map,
  block info, shape table, texture atlas.
- Ray-march renderer: hierarchical 4D DDA with chunk/brick empty-space skipping, analytic
  sub-voxel shapes, cutout/translucent/fluid handling, smooth 4D lighting and AO, polytope
  outlines, P wireframe mode, 4D sky (sun, moon phases, stars, clouds), fog, weather effects,
  composite pass, polytope line overlay, adaptive resolution scaler, GPU timer.
- Main-thread light engine (seams between columns, edit removal/re-propagation).
- Cellular 4D fluids (water, lava) on a tick budget.
- Player physics (4D hyperbox: gravity, jump, swim, climb, sprint, sneak edge protection,
  step-up, creative flight, spectator).
- Picking (CPU 4D DDA) with break/place/pick-block and orientation-aware placement.
- HUD: crosshair, hotbar, hidden-axis compass and radar, hazard edge warnings, F3 debug
  overlay, loading and pause screens.
- Test API (`window.__hc`), in-game benchmark (`?bench=1`), allocation profiler script.
- Unit tests (56), Playwright smoke/R6/bench specs, `scripts/ci.sh`, GitHub Actions workflow.
- Docs: architecture, GPU layout, 4D rendering, data formats, how-tos, Phase 1 report and
  benchmarks.
