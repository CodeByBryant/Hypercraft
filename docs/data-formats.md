# Data formats

All content is plain JSON-compatible objects (TypeScript modules today, loaded through the same
registry a JSON data pack will use later). Schemas live in `src/content/types.ts`; the
registry (`src/content/registry.ts`) validates everything at startup and fails loudly with a
list of errors (unknown texture, duplicate name, missing air, bad gravity axis…).

## Blocks (`src/content/blocks.ts`)

```ts
{
  name: 'stone_stairs',        // unique id used in saves, recipes, commands
  displayName: 'Stone Stairs', // optional
  render: 'opaque',            // invisible | opaque | cutout | translucent | fluid
  solid: true,                 // collides
  shape: 'stairs',             // shape registry name (default 'full')
  opaque: false,               // blocks light completely (default: opaque render + full shape)
  lightOpacity: 0,             // extra attenuation for non-opaque blocks (0..15)
  emission: 0,                 // block light emitted (0..15)
  climbable: false,
  fluid: undefined,            // 'water' | 'lava'
  replaceable: false,          // fluids/placement may overwrite it
  tint: '#ffffff', alpha: 1,   // translucent / fluid colour
  biomeTint: 0,                // 0 none, 1 grass colour, 2 foliage colour
  damage: 0,                   // contact damage per second
  hardness: 2,                 // mining time (Phase 3)
  textures: { all: 'cobblestone' } // or { top, bottom, side }
}
```

Numeric ids are assigned in list order at startup and are **not** stable across versions;
anything persisted must store names. A voxel is `id | meta << 12` (meta: fluid level,
orientation, slab half).

## Shapes (`src/content/shapes.ts`)

```ts
{ name: 'stairs', kind: 'boxes', variants: 'horizontal6', collision: 'shape',
  boxes: [ [[0,0,0,0],[1,0.5,1,1]], [[0.5,0.5,0,0],[1,1,1,1]] ] }
```

Boxes are 4D `[min, max]` in cell coordinates, authored for facing +X (or the bottom half).
`variants`: `none`, `vertical2` (meta 0 bottom / 1 top), `horizontal6` (meta 0..5 = facing
+X, −X, +Z, −Z, +W, −W). `kind: 'plant'` (diagonal sheets) and `kind: 'fluid'` need no boxes.
Collision uses the same boxes (`collision: 'shape'`), a full cube, or nothing.

## Textures (`src/content/textures.ts`)

```ts
{ name: 'iron_ore', pattern: 'ore', colors: ['#808080', '#6c6c6c', '#d8ad8f'], density: 0.14 }
```

Patterns: `noise, cells, grass_top, grass_side, log_side, log_top, planks, bricks, ore, glass,
leaves, fluid, glow, solid, ladder, torch, portal, plant, marker`. Each generates a 16³ RGBA
volume (`src/content/textureGen.ts`). For opaque blocks with `biomeTint`, alpha is the tint
mask (grass sides tint only the grassy fringe).

## Biomes (`src/content/biomes.ts`)

```ts
{ name: 'cherry_grove', displayName: 'Cherry Grove', kind: 'land',
  climate: [0.5, 0.55, 0.75, 0.55],          // land: [temperature, humidity, weirdness, mountains]
  surface: 'petal_turf', subsurface: 'loam', underwater: 'sand',
  stone: undefined,                           // optional: replaces stone in the top 16 blocks
  terrain: undefined,                         // optional style: dunes | mesa | marsh | steppe | ...
  heightBias: 8, heightScale: 1.2,
  trees: [{ tree: 'cherry', density: 0.006 }],                 // per column, see trees.ts
  plants: [{ block: 'pink_petals', density: 0.12 }],           // placement: surface | underwater
  particles: [{ kind: 'petal', color: '#f7a8c8', rate: 8 }],   // ambient, per second
  frozenWater: false, precipitation: 'rain',
  skyColor: '#8fb2ff', fogColor: '#e8d4ec', grassColor: '#b6db61',
  foliageColor: '#b6db61', waterColor: '#5db7ef',
  music: 'cherry',                                             // Phase 12 audio tag
  mobs: { day: [...], night: [...], cave: [...] },             // Phase 4 spawn tables
  structures: ['stone_circle', 'campsite'] }                   // Phase 5 structure names
```

`kind` decides how the biome is chosen:

* **land**: nearest climate point in (temperature, humidity, weirdness, mountains), where
  continentalness says "land". Height bias/scale and grass colour are blended across borders
  with `1/d⁴` weights; `share` (the dominant biome's weight) fades terrain styles in.
* **ocean**: where continentalness is below −0.2, nearest point in (temperature, depth);
  `climate` is `[temperature, depth 0..1, 0, 0]`.
* **underground**: cave decoration (floors, ceilings, cave plants, particles), chosen from
  cave humidity/weirdness noise; `climate` is informational.

All climate fields are fBm noise over the horizontal 3-space (x, z, w), plus an *ana bias*
field that changes about 9x faster along W, so walking kata/ana crosses biomes quicker than
walking in X/Z (see `src/world/gen/surface/Climate.ts`).

Particle kinds: `dust`, `leaf`, `petal`, `snow`, `ash`, `spore`, `firefly`, `ember`,
`bubble`, `mote` (behaviour table in `src/env/Particles.ts`). `glow` ignores lighting,
`night` only spawns after dusk.

## Trees (`src/content/trees.ts`)

```ts
{ name: 'spruce', shape: 'cone', log: 'spruce_log', leaves: 'spruce_leaves',
  height: [7, 11], radius: [2.4, 3.2] }
```

Shapes are 4D-native (canopies are balls, cones or ellipsoids in x, z and w, so every slice
cuts them differently): `ball`, `birch`, `wide`, `cone`, `acacia` (trunk bends toward one of
±X/±Z/±W), `bamboo`, `mushroom` (hollow cap), `dead`, `cactus`, `kelp` (grows up to the
water surface). Biomes reference trees by name; the registry rejects unknown names.

## Realms (`src/content/realms.ts`)

```ts
{ name: 'surface', displayName: 'The Surface', heightChunks: 8, gravityAxis: 1, gravity: 32,
  seaLevel: 48, generator: 'surface', coordinateScale: 1, dayCycle: true, ambient: 0.035,
  weather: ['clear','rain','snow','thunder','phase_storm'], skyColor: '#7aa9ff',
  fogColor: '#c3dbff', floorBlock: 'bedrock', ceilingBlock: null }
```

`generator` names an entry in `src/world/gen/generators.ts`.

## Runtime / wire formats

* **Worker → main** (`src/world/gen/protocol.ts`): per column, one `PackedChunk` per chunk
  (`bIdx: Int32Array(256)`, `bData: Uint16Array(n·256)`, `lIdx`, `lData: Uint8Array`) plus
  `heightmap: Uint8Array(4096)` and `surface: Uint8Array(4096·4)`; all buffers transferred.
* **Dense column** (worker only): `index = x + 16z + 256w + 4096y`.
* **Saves**: not implemented yet (edited columns persist in memory for the session). The
  planned format is IndexedDB chunks with a name palette and RLE brick data; see
  KNOWN_ISSUES.md.
