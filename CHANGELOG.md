# Changelog

## 0.2.0 — Phase 2: Surface terrain (2026-09-28)

### Added
- **4D climate**: continentalness, erosion, ridged peaks, temperature, humidity and
  weirdness as fBm over (x, z, w), plus an "ana bias" field that varies ~9x faster along W,
  so kata/ana walks cross biomes faster than X/Z walks. Smooth fields are sampled on a
  4-block lattice anchored to world coordinates (seamless across columns).
- **27 biomes** (19 land, 5 ocean, 3 underground), chosen by nearest climate point with
  `1/d⁴` blending of height and colours: Meadow, Tesseract Forest, Birch Glade, Orchard
  Hills, Cherry Grove, Glass Marsh, Mushroom Fen, Dense Taiga, Snow Taiga, Ice Plains, Frost
  Spires, Weathered Steppe, Savanna, Bamboo Thicket, Dune Sea, Sunscar Mesa, Bone Desert,
  Volcanic Highlands, Hollow Peaks; Ocean, Deep Ocean, Frozen Ocean, Coral Shallows, Kelp
  Deep; Lush Caves, Dripstone Caves, The Silent Layer.
- Terrain styles: dunes whose crests shift with W, terraced mesas with W-shifting
  terracotta bands, marsh flats, stepped steppe, volcano cones with lava craters, frost
  spires, W-banded floating islands (Hollow Peaks), rivers carved to below sea level.
- **4D caves**: cheese hyper-caverns, worm tunnels (intersection of three zero sets = curves
  in 4D), fissures, **Ana Sheets** (huge cavities one or two blocks thin along W, wide in X
  and Z), ravines (water-filled trenches under the sea), sinkholes, lava lakes below y 10,
  flooded humid caves; data-driven cave biomes decorate floors and ceilings (`ceiling` block,
  floor/ceiling plants, trees).
- **Lakes**: contained 4D bowls above sea level (frozen in cold biomes).
- **Ores** as 4D capsule veins with depth ranges (coal, copper, iron, gold, azurite,
  fluxite, verdant in mountains, hyperite) and deep variants near bedrock; geodes (shell,
  calcite, amethyst, clusters), fossils in the Bone Desert.
- ~170 new blocks (stones, soils, turf per biome, terracotta, corals, logs/leaves for 8 wood
  types, cactus, bamboo, kelp, seagrass, anemones, flowers and glowing plants, ores); every
  biome has at least 3 unique blocks and 2 unique plants (unit-tested); 16 tree archetypes
  with 4D canopies (ball, birch, cone, acacia bending into ±W, wide, bamboo, giant mushrooms,
  dead trees, cactus, kelp).
- **Ambient particles** per biome (dust, leaves, petals, snow, ash, spores, fireflies,
  embers, bubbles, motes), each a tiny 4-ball drawn as its slice disc, so they swell and fade
  as they drift through your slice; *Particles* setting (all/reduced/off).
- F3 shows the world seed, the cave biome underground and particle counts.
- Unit tests: 15 world-generation tests (determinism, all biomes occur, underground biomes,
  caves, Ana Sheets, ore depths, rivers, lakes, vegetation, spawn on dry land, speed), 3
  particle tests, unique content per biome.

### Changed
- Generator is `surface` (Phase 1's `surface_phase1` is gone): worlds created with 0.1.x
  regenerate with the new terrain; edited columns from old saves keep their old contents.
- Column generation optimised (segmented fills, shared cave-field interpolation, hoisted
  ids): about 44 ms per column in Node.
- The engine test garden (test worlds only) now searches for a flat dry site and covers the
  spawn point; e2e views/bench are spawn-relative.
- Brick pools start larger (sized for Phase 2 terrain) to avoid regrow stalls.

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
