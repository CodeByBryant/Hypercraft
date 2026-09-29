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

## Items (`src/content/items.ts`)

Every block gets a block item with the same name automatically (except fluids, portals and
"lit" state blocks listed in `NO_ITEM_BLOCKS`; `BLOCK_ITEM_EXTRAS` adds fuel values and
groups). Other items are data:

```ts
{ name: 'iron_ingot', displayName: 'Iron Ingot', group: 'materials',
  icon: { shape: 'ingot', colors: ['#dcdcdc', '#9a9a9a', '#ffffff'] } }   // main, shade, accent
{ name: 'lava_bucket', maxStack: 1, use: 'lava_bucket', fuel: 1000, fuelRemainder: 'bucket',
  icon: { shape: 'bucket', colors: ['#c8c8c8', '#7a7a7a', '#ff7a1a'] } }
```

* `icon.shape` is one of the procedural pixel-art shapes in `src/content/itemIcons.ts`
  (pickaxe, axe, shovel, hoe, sword, shears, ingot, gem, nugget, raw, dust, lump, stick,
  bucket, flint_steel, compass, clock, ball, brick, shard, flint, apple, bone).
* `tool: { kind, tier }` makes a tool; durability, speed and harvest level come from the
  tier. Tools for every tier are generated in `items.ts`.
* `fuel` is furnace burn time in seconds; blocks tagged `log` / `planks` burn 15 s
  (`TAG_FUEL`).
* `use` (bucket, water_bucket, lava_bucket, flint_and_steel) and `readout` (compass, clock)
  select engine behaviours.
* Item tags = the item's own `tags` plus the tags of the block it places, so recipes can use
  `#planks`, `#log`, `#sand`, `#coal`, `#stone_crafting`.

## Tool tiers (`src/content/tiers.ts`)

```ts
{ name: 'iron', displayName: 'Iron', level: 2, speed: 6, durability: 250, damage: 2,
  enchantability: 14, material: 'iron_ingot', color: '#e0e0e0', shade: '#9a9a9a' }
```

Levels: 0 wood/gold, 1 stone/copper, 2 iron/azurite, 3 verdant/hyperite.

## Mining (`src/content/mining.ts`)

Per block name: `{ tool?: ToolKind, tier?: number, drops?: DropDef[] | 'none', shears?: true }`.
Blocks without an entry break by hand and drop themselves. `tier` means "needs a `tool` of at
least this harvest level to drop anything". Break time follows Minecraft's formula (see
`src/game/items/Mining.ts`): `speed / hardness / (canHarvest ? 30 : 100)` progress per tick,
with speed = tier speed for the right tool, /5 in the air and /5 under water.

```ts
MINING.iron_ore = { tool: 'pickaxe', tier: 1, drops: [{ item: 'raw_iron' }] };
MINING.gravel = { tool: 'shovel', drops: [{ item: 'flint', chance: 0.12 }, { item: 'gravel', chance: 0.88 }] };
```

## Recipes (`src/content/recipes.ts`)

```ts
{ type: 'shaped', pattern: ['MMM', ' s ', ' s '], key: { M: 'iron_ingot', s: 'stick' }, result: 'iron_pickaxe' }
{ type: 'shapeless', ingredients: ['iron_ingot', 'flint'], result: 'flint_and_steel' }
{ type: 'smelting', input: 'raw_iron', result: 'iron_ingot', furnaces: ['furnace', 'blast_furnace'] }
```

Shaped recipes match anywhere in the grid and mirrored left-right; recipes of at most 2x2
(or at most four shapeless ingredients) also work in the inventory's crafting grid. Smelting
takes `time` seconds (default 10) in a furnace and half that in a blast furnace or smoker.
All names are validated at startup (`Crafting` constructor) and by unit tests.

## Mobs (`src/content/mobs.ts`)

```ts
{ name: 'kata_sheep', displayName: 'Kata Sheep', hostile: false, ai: 'passive',
  health: 8, speed: 1.6, width: 0.45, height: 1.25,
  parts: [box([0, 0.78, 0, 0], [0.36, 0.3, 0.52, 0.36], '#eeeeea'), ...tetraLegs('#d8c8b0', 0.5, 0.24, 0.07)],
  drops: [{ item: 'wool', count: [1, 1] }, { item: 'raw_mutton', count: [1, 2] }] }
```

**Body.**
* `parts`: 1–16 analytic primitives in the mob's own frame (x right, y up, z forward, w
  its own ana axis). The kinds are:
  * `box`: centre `at` and half extents `size`;
  * `ball`: centre `at` and radius `r`;
  * `capsule`: ends `at` and `to`, and radius `r`.
* Optional part fields:
  * `anim`: `leg`, `head`, `wing`, `tail` or `pulse`;
  * `phase`: an offset in radians;
  * `glow`.
* `width` (hitbox half-width in x, z and w) and `height`: collision and projectile hits.

**Behaviour.**
* `ai`: one of the behaviour profiles in `MobManager.think`. The how-to lists them.
* `hostile` mobs need `damage`, except exploders.

**Optional behaviour fields.**

| field | meaning |
| ----- | ------- |
| `burnsInDay` | burns in daylight under open sky |
| `fireproof` | immune to lava |
| `splits` | splits into this many copies on death |
| `scale: [min, max]` | random size per mob |
| `sliceBound` | only damageable while crossing your slice |
| `projectile: { item, cooldown, damage }` | ranged attack |
| `blast: { radius, fuse }` | exploder |
| `lays: { item, every: [min, max] }` | drops an item every so often |

The compiled registry (`mobRegistry.ts`) precomputes a bounding radius per mob (the parts
plus 0.35 blocks of animation slack) and linear part colours. It validates everything at
startup:
* part fields;
* drops and projectile items;
* the damage rule;
* every biome spawn table entry.

**Spawn tables** live on biomes: `mobs: { day, night, water, cave }`. Each is a list of
`{ mob, weight, group?: [min, max] }`.

**GPU record** (`MobManager.pack`, one RGBA32F texture of 256 × N texels):
* **Per mob, 6 texels:**
  * position relative to the window origin;
  * R, F and H of its frame;
  * `(bounding radius, first part, part count, hurt flash)`;
  * `(scale, fuse flash, 0, 0)`.
* **Per part, 4 texels, from texel 288:**
  * `(kind, radius, glow, 0)`;
  * `at`;
  * `size` for boxes, or `to` for capsules;
  * colour.

At most 48 mobs are uploaded per frame: those whose bounding 4-ball crosses the view
hyperplane.

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
* **Saves** (IndexedDB, see `src/save/`): edited columns with a block-name palette, world
  metadata and `SavedState.player.data` (`inventory`, and since Phase 4 `vitals: { health,
  air }`). Mobs are not saved yet (they respawn naturally).
