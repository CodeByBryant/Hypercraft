# Phase 2 report: Surface terrain

Status: **complete**. Screenshots: `docs/screenshots/phase-2/`. Benchmarks:
`docs/benchmarks/phase-2.md`.

## R6 reference views

Rendered by `tests/e2e/views.spec.ts` at 360p internal (640×360, upscaled to 1280×720),
hovering 3 blocks above spawn in a `seed=hypercraft` test world, pitch −14°, looking toward
the engine test garden. The garden now sits on the nearest flat dry site, which for this seed
is a border between Snow Taiga (left) and a Tesseract Forest/Meadow edge (right), so the
views show Phase 2 terrain around the reference objects.

### 1. Axis-aligned (hidden axis = +W) — `1-axis-aligned.png`

**Cubes.** The garden floor tiles are squares; the 3×3×3 marker sculpture, the ±X/±Z marker
posts, the ladder post, slabs and stairs are regular cubes and half-cubes. On the left, the
snow-covered turf steps and the frosted spruce cones are stacks of cubes; on the right, grass
terraces show straight cube edges and oak canopies (4D balls) show as blocky round blobs.

### 2. XW tilt 30° — `2-xw-30.png`

**Stretched boxes (prisms with rectangular bases), not cubes.** The screen's right axis is now
`cos30·X + sin30·W`. The marker sculpture splits into full-width columns alternating with
thin slivers where the slice crosses a W boundary; floor tiles have two alternating widths;
the snow and grass terraces have steps at positions set by both X and W. The spruces on the
left show trunks cut at odd places, because a W-slice of a 4D cone is not a cone.

### 3. XW 45° + ZW 45° — `3-xw45-zw45.png`

**Triangular, quadrilateral and hexagonal prisms.** The floor tiles become a mesh of
triangles and hexagons. Grass-block tops are triangles and hexagons, and the terraces form
columns of prisms with slanted sides. Oak canopies are partial, lumpy blobs, and some trunks
end in mid-air or have no canopy, because the rest of the tree is off the slice in W. With
hidden axis `(−0.71, 0, −0.5, 0.5)` this is the plane-∩-cube polygon extruded along Y, as
the slice maths predicts (unit-tested in Phase 1).

None of the tilted views shows cubes.

## What works

* **4D climate** (`src/world/gen/surface/Climate.ts`): continentalness, erosion, ridged
  peaks, temperature, humidity and weirdness as fBm over (x, z, w), plus an *ana bias* field
  that changes about 9x faster along W. Walking kata/ana therefore crosses biomes faster than
  walking in X/Z, which makes the hidden axis worth exploring. Smooth fields are sampled on a
  4-block lattice anchored to world coordinates (seamless across columns) and interpolated.
* **27 biomes** (19 land, 5 ocean, 3 underground; the brief asked for 24+). Land biomes
  come from the nearest climate point in (temperature, humidity, weirdness, mountains), oceans
  where continentalness is low, from (temperature, depth). Height and colours blend across
  borders with `1/d⁴` weights. Unit tests confirm every land and ocean biome occurs within
  ±9000 blocks and that terrain and biomes change along W.
* **Terrain styles**: dunes whose crest phase depends on W (step kata/ana and the dunes
  shift), terraced mesas with terracotta bands that shift with W, marsh flats near sea level,
  stepped steppe, volcano cones with lava craters, frost spires, floating islands in Hollow
  Peaks that exist in W bands (walk ana and islands appear and vanish), rivers carved below
  sea level.
* **4D caves** (`src/world/gen/surface/Caves.ts` + `SurfaceGen`):
  * cheese hyper-caverns (4D blobs: any 3D slice is a walkable cave);
  * worm tunnels, the intersection of three noise zero sets, i.e. *curves* in 4D. A slice
    crosses them as pockets that drift as you move kata/ana;
  * fissures (a thin 3D sheet in 4D, a crack or crawlway in a slice);
  * **Ana Sheets**: one huge cavity per 96-block W cell, 1–2 blocks thin along W but
    hundreds of blocks wide in X and Z. Invisible from most slices; step into the right W
    and a cavern opens underfoot;
  * ravines (they also cut through ocean floors, as water-filled trenches), sinkholes, lava
    lakes below y 10, flooded humid caves.
* **Lakes**: 4D bowls (balls in x, z, w) dug into the terrain and filled to one level just
  below their lowest rim sample, with sealed beds. A slice shows a pond whose outline changes
  as you move kata/ana. Frozen in cold biomes.
* **Cave biomes**, data-driven from their `BiomeDef` (floor block = `surface`, optional
  `ceiling` block, floor/ceiling plant tables, trees): Lush Caves (moss, ferns, glow
  berries, spore blossoms, vines, azalea bushes), Dripstone Caves (dripstone, lichen), The
  Silent Layer (echo moss, hush stone ceilings, echo sprouts and vines; deep only), and plain
  stalactites and stalagmites elsewhere.
* **Ores**: 4D capsule veins with depth bands, and deep variants near bedrock. Coal, copper,
  iron, gold, azurite, fluxite, verdant (mountains only) and hyperite (rare, near bedrock).
  Also geodes (shell, calcite, amethyst, clusters) and fossils in the Bone Desert.
* **Vegetation**: 16 tree archetypes with 4D canopies: balls, cones, ellipsoids, acacias whose
  trunks bend into ±X/±Z/**±W**, bamboo, giant mushrooms, dead trees, cactus, kelp. Features
  are generated with a 4-block margin, so canopies cross column borders seamlessly. Biome
  plants include flowers, glowing plants, corals, seagrass, anemones and polyps.
* **Unique content per biome**: every biome has at least 3 blocks and 2 plants no other
  biome uses (enforced by a unit test), for 203 blocks in total.
* **Ambient particles** (`src/env/Particles.ts`, `src/render/SpriteBatch.ts`): each biome
  lists dust, leaves, petals, snow, ash, spores, fireflies (night), embers, bubbles
  (underwater) or motes. Each particle is a tiny 4-ball; it is drawn as its slice disc
  (radius √(R² − d²)), so particles swell and fade as they drift through your slice, and
  moving kata/ana sweeps through them. Depth-tested against the ray-marched scene, lit by
  the light at their cell, and respecting open sky (no snow in caves). There is a
  *Particles* setting (all/reduced/off).
* **Performance**: column generation was optimised from 124 ms to about 44 ms in Node (the
  worker build is faster still) with segmented fills, shared cave-field interpolation,
  per-column cave biomes and block ids hoisted out of the voxel loops.
* F3 shows the seed, the cave biome when you are underground, and particle counts.
* Test worlds (`?test=1`) search for a flat dry garden site and put spawn on it. The e2e
  walk test and the R6 views are spawn-relative.

## Verification

* `npm run typecheck`: clean.
* `npm test`: **69 tests** in 9 files (15 world-generation tests, 3 particle tests, and the
  unique-content-per-biome check).
* `npx playwright test smoke views`: pass (boot → walk 6.5 blocks → mine → place → rotate
  → screenshot; R6 views).
* Benchmarks: `docs/benchmarks/phase-2.md`.

## What's broken / limited

* **GPU memory grew** with the busier terrain: about 980 non-uniform block bricks per
  column, against about 530 on the Phase 1 test terrain. See the benchmark for pool sizes.
  8-bit palette bricks are the planned fix if hardware numbers show pressure.
* Structures (Phase 5) and mobs (Phase 4) are data-only: biomes already list structure names
  and spawn tables.
* Old 0.1.x saves regenerate unedited columns with the new generator, so edited columns can
  seam against new terrain.
* Rain/snow *weather* is still a screen-space overlay; only biome particles are 4D.
* Underground biomes are chosen by two noise fields in `caveBiome()`; a new underground
  biome is data-only for its decoration but needs a selection rule there.
* Lakes use the direct climate sample (not the column lattice) for their level, so a lake
  rim can differ by a block from the surrounding terrain; trees grown from a neighbouring
  column can overhang a lake.
* R5 frame rates are still not measured on real GPUs (container = software GL).

## What's next (Phase 3)

Items and inventory, survival mining with hardness and tool tiers, block drops as 4D item
entities, crafting (2×2 and a 3×3×3 **4D crafting hypergrid** where W layers matter),
furnace and fuels, tools.
