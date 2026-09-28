# Known issues

Honest list as of Phase 1 (engine). Items tagged with the phase expected to address them.

## Unverified / performance
- **R5 not measured on real GPUs.** Development ran in a GPU-less container (SwiftShader
  software GL, about 3 s per 360p frame). GPU-independent metrics look healthy (about 25 ray
  steps per pixel, see `docs/benchmarks/phase-1.md`), but 60 fps at 360p on integrated GPUs
  must be confirmed with `?bench=1` on real hardware.
- **GPU memory**: brick pools use ~84 MB at render distance 4 (≈530 non-uniform 16-bit block
  bricks per column + light bricks). Options: fewer isolated ore bricks, 8-bit palette bricks,
  shrinking pools. Default render distance may need to drop to 3 on low-end devices.
- **Pool regrow hitch**: when a brick pool fills up it is recreated larger and *every*
  resident chunk is re-uploaded, which is a visible stall. The initial size is estimated from
  the render distance, so this should be rare.
- Rotating the slice by large angles triggers streaming of a new shell of columns
  (~0.5–1 s of fog-coloured unloaded areas at the edges). Inherent to 4D; can be softened
  with a larger hidden-axis margin.

## Rendering
- The camera is always upright (hidden axis never has a Y component), so cross-sections are
  always prisms along Y. Free SO(4) rotations are not exposed.
- Texture (u, v, s) mapping assumes Y is world-up; the Mirror Realm (gravity along W) will
  need a remap (Phase 9).
- Stars are cells on the 3-sphere of directions and look polygonal when cut by the slice
  (intended 4D effect, but can look blocky).
- Translucency is capped at 6 pass-throughs per ray; deep stacks of glass/water go dark behind.
- Rain/snow are screen-space overlays masked by whether the player is under open sky; they
  are not 4D particles and do not stop at nearby roofs.
- Distant fog colour can differ slightly from the sky at high elevations during sunsets.
- The P wireframe overlay is busy in dense terrain (it outlines every exposed cell within 2
  blocks of the target).

## World / simulation
- Saves store edited columns including their light; light changes caused by edits in a
  *neighbouring* column after that column was saved can leave slightly stale light at the
  seam on reload (increases are re-propagated, decreases are not).
- Starting or leaving a world reloads the page (simple and leak-free, but not instant).
- Terrain is a Phase 1 test generator (4 biomes, cheese caves, simple ores and trees). The
  full biome/cave/ore system is Phase 2. The **engine test garden** near spawn (x −12..12,
  z 4..28, w −4..4) is a showcase for the R6 views and will be removed.
- Fluids: no "flow toward the nearest drop" heuristic, flowing water does not push entities,
  surfaces are per-cell boxes (no sloped surfaces), and generated oceans are static until
  disturbed.
- Light: seam propagation between columns and edit updates run on the main thread with a
  budget, so a large edit can take a few frames to settle. No coloured block light.
- Lava is only a hazard visually (red flash, R2 warnings); there is no health system yet
  (Phase 4). Fall distance is tracked but causes no damage.

## Gameplay / UX
- Mining is instant (creative-style) even in survival; no drops, inventory or crafting
  (Phase 3).
- No audio (Phase 12).
- No key-rebinding UI yet (bindings are data in `src/input/Input.ts`); gamepad support is
  Phase 12. Touch controls exist but have only been tested in emulation.

## Tooling
- The original prototype `tesseract-miner.html` was not in the repository, so the renderer
  was rebuilt from the description in the brief.
- E2E tests run on SwiftShader and are slow; they render on demand and at low resolutions.
