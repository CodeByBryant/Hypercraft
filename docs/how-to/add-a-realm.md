# How to add a realm

1. Write a generator implementing `WorldGenerator` (`src/world/gen/generators.ts`):
   `generate(cx, cz, cw, blocks, surface)` fills a dense column
   (`index = x + 16z + 256w + 4096y`) and per-(x,z,w) surface colours; `spawnPoint()` returns a
   safe spawn. Register it in `GENERATORS`.
2. Add a `RealmDef` to `src/content/realms.ts`: height in chunks, gravity axis and strength
   (Y for most realms, W for the Mirror Realm), sea level, generator id, day cycle, ambient
   light, allowed weather, sky/fog colours, floor/ceiling blocks, and the portal
   `coordinateScale` (Ember Depths = 8, see the portal design note below).
3. Biomes for the realm go in `biomes.ts` (Phase 2 adds a realm field to biomes).

The renderer is realm-agnostic: the camera frame and physics take the gravity axis as a
parameter, and the sky uses the realm's colours and day-cycle flag.

**Portal coordinate scale (design note, Phase 6).** A portal maps `(x, z, w)` by dividing by
the destination's `coordinateScale` (and multiplying on the way back), leaving y to the
destination's safe-landing search. All three horizontal axes scale together, so a W-offset
between two Surface portals is preserved (scaled) in the Ember Depths, just like X and Z.
