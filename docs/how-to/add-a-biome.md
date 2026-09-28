# How to add a biome

1. Add any new blocks/textures first (see add-a-block.md).
2. Append a `BiomeDef` to `src/content/biomes.ts` with a climate point (`temperature`,
   `humidity` in 0..1), surface/subsurface/underwater blocks, height bias/scale, tree and grass
   densities, precipitation, and sky/fog/grass/foliage/water colours.
3. That's it for the renderer: sky and fog tint, grass/foliage tint (via the surface map
   texture), and snow vs rain all come from the biome data. `selectBiome()` picks the nearest
   climate point and blends height parameters and grass colour across borders.
4. `npm test` checks that every biome occurs somewhere and that biomes vary along W.

Phase 2 extends `BiomeDef` with weirdness/elevation/"ana bias" climate axes, per-biome
features (plants, trees, ores, structures), ambient particles and music tags; the same
data-only rule applies.
