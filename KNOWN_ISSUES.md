# Known issues

Honest list as of Phase 3 (items, inventory, mining, crafting). Items tagged with the phase expected to address them.

## Unverified / performance
- **R5 not measured on real GPUs.** Development ran in a GPU-less container (SwiftShader
  software GL, about 3 s per 360p frame). GPU-independent metrics look healthy (about 25 ray
  steps per pixel, see `docs/benchmarks/phase-1.md`), but 60 fps at 360p on integrated GPUs
  must be confirmed with `?bench=1` on real hardware.
- **GPU memory**: Phase 2 terrain is much busier than the Phase 1 test terrain: about 980
  non-uniform block bricks per column (was ≈530), so brick pools at render distance 4 are
  larger (see `docs/benchmarks/phase-2.md`). Options: 8-bit palette bricks, fewer isolated
  ore bricks, shrinking pools. Default render distance may need to drop to 3 on low-end
  devices (Phase 12 settings presets).
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
  are not 4D particles and do not stop at nearby roofs. (Biome snowfall *particles* are 4D and
  do respect roofs.)
- Ambient particles take their brightness from the light value of the cell they are in; they
  cast no shadows and pass through leaves and other non-opaque blocks.
- Distant fog colour can differ slightly from the sky at high elevations during sunsets.
- The P wireframe overlay is busy in dense terrain (it outlines every exposed cell within 2
  blocks of the target).

## World / simulation
- Saves store edited columns including their light; light changes caused by edits in a
  *neighbouring* column after that column was saved can leave slightly stale light at the
  seam on reload (increases are re-propagated, decreases are not).
- Starting or leaving a world reloads the page (simple and leak-free, but not instant).
- The **engine test garden** only exists in test worlds (`?test=1`); it is a flat plateau
  on the nearest flat dry site (x −12..12, z −8..28, w −4..4 around it) used by the R6 views
  and the e2e walk test.
- Worldgen: structures are Phase 5 (biomes already list their structure names); mob spawn
  tables are data only until Phase 4. Underground biomes are chosen by two noise fields in
  `caveBiome()`, so a new underground biome needs a selection rule there (its decoration is
  data-driven).
- Lakes take their level from the direct climate sample rather than the column lattice, so a
  rim can be off by a block; trees rooted in a neighbouring column can overhang a lake.
- Worlds saved with 0.1.x/0.2.x regenerate unedited columns with the current generator
  (terrain was rebalanced in 0.3); their edited columns keep old terrain, so seams can
  appear at those columns.
- Mountain flanks can still be steep (up to ~15 blocks per step at ridge crests); coasts and
  rivers are smooth.
- Your body is 0.6 wide along the hidden axis too, so a block just off your slice (within
  0.3 of it) can stop you although it is not visible. The hidden-axis radar and the blocked
  indicators show it (R2).
- Trees and features crossing column borders are generated with a 4-block margin; a very
  wide canopy (radius > 4) or a volcano/spire straddling several columns is consistent, but
  giant structures will need the Phase 5 structure pipeline.
- Fluids: no "flow toward the nearest drop" heuristic, flowing water does not push entities,
  surfaces are per-cell boxes (no sloped surfaces), and generated oceans are static until
  disturbed.
- Light: seam propagation between columns and edit updates run on the main thread with a
  budget, so a large edit can take a few frames to settle. No coloured block light.
- Lava is only a hazard visually (red flash, R2 warnings); there is no health system yet
  (Phase 4). Fall distance is tracked but causes no damage.

## Gameplay / UX
- Items: armour slots exist but no armour until Phase 7; food items (apples) cannot be
  eaten until hunger exists (Phase 7); flint and steel has nothing to light until portals
  (Phase 6). Enchanting, anvils, smithing are Phase 7.
- Dropped items are only visible while your slice passes through them (by design: they are
  4D objects). They can still be picked up from up to 1.6 blocks away in 4D, and the
  hypercompass-style indicator for items is not implemented.
- Furnaces only run while their column is loaded (no offline catch-up), like Minecraft.
- The inventory screen does not support drag-to-distribute, double-click collect or
  keyboard-only navigation yet (Phase 12 accessibility).
- The recipe book fills the grid from the inventory but does not show ingredient ghosts.
- No audio (Phase 12).
- No key-rebinding UI yet (bindings are data in `src/input/Input.ts`); gamepad support is
  Phase 12. Touch controls exist but have only been tested in emulation.

## Tooling
- The original prototype `tesseract-miner.html` was not in the repository, so the renderer
  was rebuilt from the description in the brief.
- E2E tests run on SwiftShader and are slow; they render on demand and at low resolutions.
