# How to add a biome

1. Add any new blocks and textures first (see add-a-block.md). Surface blocks that should
   take the biome's grass colour use `biomeTint` (the `turf` helpers in
   `src/content/terrain.ts` make a top/side/soil set in one line).
2. If the biome needs a new tree, add a `TreeDef` to `src/content/trees.ts` (shape, log,
   leaves, height and radius ranges).
3. Append a `BiomeDef` to `src/content/biomes.ts` (format in `docs/data-formats.md`):
   * `kind: 'land'` with a climate point `[temperature, humidity, weirdness, mountains]`, or
     `kind: 'ocean'` with `[temperature, depth, 0, 0]`;
   * surface/subsurface/underwater blocks, optional `stone` and `terrain` style;
   * height bias/scale, trees, plants, ambient particles, colours, precipitation;
   * optional mob tables (Phase 4) and structure names (Phase 5).
4. Nothing else is needed: the generator resolves every name through the registry, sky/fog
   and grass/foliage/water tints come from the biome data (via the surface map texture),
   particles are spawned from `particles`, and F3 shows the biome name.
5. Run `npm test`. The registry test checks every name the biome references, and the
   world-generation test checks that every land and ocean biome occurs within ±9000 blocks of
   the origin (move your climate point if it is shadowed by a neighbour).

Underground biomes (`kind: 'underground'`) are picked from the cave humidity/weirdness noise
in `SurfaceGenerator.caveBiome()`; adding one currently also needs a branch in
`decorateCaves()` for its floor/ceiling blocks.
