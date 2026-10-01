# Known issues

Honest list as of Phase 6 (the Ember Depths, portals, the Magma Regent). Items tagged with the phase expected to address them.

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
- Worldgen: underground biomes are chosen by two noise fields in
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

## Mobs and combat (Phase 4)
- **Most mobs are not saved.** Leaving or reloading a world clears them, and they spawn again
  naturally. Villagers are the exception (Phase 5). Named, tamed and boss mobs come with
  husbandry (Phase 7).
- **No audio cues yet** (Phase 12). R2 warnings are visual: the violet screen edge, the radar
  dots and the warning line.
- **Hitboxes.** Hitboxes are axis-aligned boxes: `width` along x, z and w. Picking and
  rendering use the exact rotated primitives, but collision does not, so a long mob facing
  diagonally collides like a smaller box. Mobs do not push each other or the player.
- **Hits along the hidden axis.** A hostile can hit you from up to about one block kata/ana,
  because its reach is measured in 4D. It is always announced, by the violet edge and the
  warning line, and the red damage flash shows which side the hit came from. Hostiles chase
  your position, which is in your slice, so in practice they converge into view.
- **Explosions.** Explosions are a 4D ball, not ray-traced for exposure: blocks and players
  behind walls are still hit. 30% of the broken blocks drop, merged into stacks.
- **Pathfinding.** The budget is 2 searches per frame, 700 nodes each, refreshed about every
  1.2 s per mob. Mobs at the budget limit steer directly and can get stuck on complex
  terrain for a moment.
- **Lighting.** Mobs take the light of the cell where the ray hits them. They cast no shadows
  and have no textures, only flat colours with directional shading.
- **The Ana Stalker** keeps its thin axis on your hidden axis. Rotating the slice very fast
  can show it edge-on for a frame before it re-aligns.
- **Not yet:**
  - riding Dune Camels and Hyperhorses, and camel chests (mounts, Phase 10);
  - breeding and taming (Phase 7);
  - hunger, food and armour (Phase 7);
  - mob sounds (Phase 12).

  Hyperbats are passive, like Minecraft bats. Swarm attacks are planned for the Hollow Void.
- **Difficulty.** Difficulty scales mob damage (easy ×0.5, hard ×1.5); peaceful removes
  hostiles. There is no UI to change it after world creation yet (Phase 12 settings).

## Structures, villagers and beds (Phase 5)
- **Structures are generated per column**, from a cached plan. A structure whose radius is
  set too small in its data would be cut at column borders; the unit tests check that every
  structure stays within its radius for one seed.
- **Structure generation cost.** It adds about 10–13 ms per column in structure-dense areas
  (a village area measured 35 ms per column against 22 ms without). That only affects
  streaming speed, on worker threads.
- **Terrain features ignore structures.** Trees and plants generated before the structure
  pass can poke through roofs and floors. Houses cut hills back only where their footprint
  is.
- **Villagers** have simple AI:
  - no schedules beyond "home at night";
  - no workstations or gossip, and no breeding (Phase 7);
  - no zombie villagers.

  Only villagers are saved with the world. Other mobs still respawn naturally.
- **Hitting any villager** lowers your reputation with every villager of its village, not
  only the ones that saw it.
- **Beds**:
  - there is no lying-down pose;
  - sleeping skips the time in one step, so furnaces and crops do not catch up;
  - in the Ember Depths beds explode, as in Minecraft's Nether.
- **Atlases** search up to 1600 blocks (4D distance in x, z and w), and only the Surface has
  structures so far.
- Dungeons, hypermines and vaults are dark inside: bring torches.

## Ember Depths, portals, bosses (Phase 6)
- **A realm trip reloads the page.** Game, world, workers and GPU state are rebuilt for the
  destination, which takes a few seconds (the loading screen says "Entering…"). Saved worlds
  keep both realms' edits. Test worlds carry the player over, but not the edited columns, so a
  portal built in a test world is gone when you come back; the arrival then builds a new one.
- **Arrival portals are always the smallest size** (a flat 2 × 3 portal, or a 2 × 3 × 2
  hyper-portal, whichever shape you left through). You arrive in a known portal of the
  destination realm within 128 blocks (Surface) or 16 (Ember Depths), or a new one is built
  on the nearest free ground within 8 blocks. Failing that, it is carved into the terrain
  with a platform, so it can end up floating or inside a cliff.
- **Portal membranes are full translucent cells**, not thin sheets. Walking along the
  normal, you are inside the membrane for one cell.
- **Fire doesn't spread**, and fire you light never goes out on its own; punch it out.
- **The Magma Regent** always spawns from its caldera, once. It doesn't respawn after it
  dies, and there is only one per caldera.
- **Lava pillars** only replace air and plants, so a pillar under a roof is shorter. They
  last 3 s.
- **Soul sand and ash slow you**, but mobs ignore it. Nothing in the Ember Depths flows
  faster than on the Surface (Minecraft's Nether lava does).
- **Basalt prism columns** are hashed per W layer, so they only line up in slices whose
  hidden axis is W. This is by design (the spec's "only fully visible along one slice
  orientation"), but walking kata/ana through them is bumpy.
- **Ember generation** costs about 42 ms per column in Node (the Surface about 63 ms there).
- **Not yet:** striders or riding on lava, bartering, Slag Armor (Phase 7 smithing), and
  Ember advancements (Phase 8).

## Gameplay / UX
- Items: armour slots exist but no armour until Phase 7; food items (apples) cannot be
  eaten until hunger exists (Phase 7). Enchanting, anvils, smithing are Phase 7.
- Dropped items are only visible while your slice passes through them (by design: they are
  4D objects). They can still be picked up from up to 1.6 blocks away in 4D, and the
  hypercompass-style indicator for items is not implemented.
- Furnaces only run while their column is loaded (no offline catch-up), like Minecraft.
- The inventory screen does not support drag-to-distribute, double-click collect or
  keyboard-only navigation yet (Phase 12 accessibility).
- The recipe book fills the grid from the inventory but does not show ingredient ghosts.
- No audio (Phase 12).
- No key-rebinding UI yet (bindings are data in `src/input/Input.ts`); gamepad support is
  Phase 12.
- **Touch controls** are covered by an e2e spec with emulated touch events on a phone-sized
  screen (hotbar, closing screens, tap to hit and place, long-press mining), but they have
  not been tested on many real devices. On touch, taps interact where you tap, and the Hit /
  Use buttons act at the crosshair. There is no drag-to-distribute in screens, and no
  haptics yet.
- **Wandering mobs follow your slice.** Wandering mobs within 32 blocks and 6 blocks kata/ana
  of your slice move into it and stay in it. That covers animals, and hostiles that have not
  noticed you; Ana Stalkers are the exception. This is a deliberate playability concession:
  otherwise animals drift in and out of view as they walk through W. Hostiles that are
  chasing you use their own 4D paths, and the R2 warnings still cover them.

## Tooling
- The original prototype `tesseract-miner.html` was not in the repository, so the renderer
  was rebuilt from the description in the brief.
- E2E tests run on SwiftShader and are slow; they render on demand and at low resolutions.
