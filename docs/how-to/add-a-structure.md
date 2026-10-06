# How to add a structure

A structure has three parts. All of them are data, except the builder:

1. **A placement entry** in `src/content/structures.ts`. It says where the structure can
   appear, how often, and which builder makes it.
2. **A builder**: a function in `src/world/gen/structures/builders/` that writes blocks,
   chests, spawners and villagers through a small toolkit (`Builder`).
3. **Biome opt-in**: the structure's name goes into the `structures` list of the biomes it
   may generate in (`src/content/biomes.ts`).

Loot for its chests goes in `src/content/loot.ts`.

## 1. Placement

```ts
{ name: 'cabin', displayName: 'Cabin', placement: 'surface', spacing: 64, chance: 0.28,
  builder: 'cabin', radius: 6, salt: 0x5201 }
```

| field | meaning |
| ----- | ------- |
| `placement` | `surface`, `beach`, `underwater`, `underground` (needs `y: [min, max]`), `sheet` (on an Ana Sheet), `lava` or `cavern` (Ember Depths) or `island` (Hollow Void: on top of a floating island, picked by the generator through `StructureTerrain.islandHost`; `spacing` is the island lattice cell and `chance` the share of islands that get one) |
| `spacing` | one attempt per `spacing`³ cell of the horizontal 3-space (x, z, w) |
| `chance` | chance that a cell's attempt happens, before the biome and terrain checks |
| `radius` | the furthest any block can be from the start, horizontally. Columns only look at starts within this radius, so **keep every write inside it** (the unit tests check this) |
| `salt` | any number unique to this structure; it keeps the grids independent |
| `params` | free-form data passed to the builder (villages use `{ style }`) |

**The grid is 4D.** A slice only shows structures whose W extent crosses it. So grids are
denser than Minecraft's: roughly, a slice sees `chance × (w extent / spacing)` structures
per `spacing²` area.

**How a start is chosen** (`Placement.ts`, deterministic from the world seed):
1. a hash of the cell and `salt` decides whether the attempt happens;
2. the start is jittered inside the cell;
3. it must be outside the engine's test garden;
4. the biome at the start must list the structure;
5. the placement kind sets the start height and checks the terrain (dry land, the shore,
   water depth, a sheet cell);
6. one of the 48 horizontal orientations is picked.

## 2. Builder

```ts
// src/world/gen/structures/builders/small.ts
export function cabin(b: Builder): void {
  const log = id(b.pick(['log', 'spruce_log', 'birch_log'])), planks = id('planks');
  b.room(-3, 0, -3, -3, 3, 5, 3, 3, log, planks, planks); // six walls, floor and roof
  b.box(0, 1, 3, 0, 0, 2, 3, 0, 0);                      // a door in the +b wall
  b.chest(-2, 1, -2, 2, 'cabin');                         // filled from the 'cabin' loot table
  b.set(2, 1, 2, -2, id('red_bed'));
}
```

Register it in `builders/index.ts` (`BUILDERS`). The `StructureGen` constructor throws on a
missing builder, and a unit test constructs it.

**Coordinates are local.** `(a, y, b, c)` means right, up, forward, and the piece's own ana
axis. The origin is the start, at ground height for surface structures. The builder does
not know which world axes it is using: the start's orientation maps (a, b, c) onto
(±x, ±z, ±w) in one of 48 ways. So the same house may face +z in one village and −w in the
next, and its "ana" wall can be any horizontal direction. **In 4D a room has six walls**, and
a door in a ±c wall can only be reached by moving kata/ana.

**Toolkit (`Builder.ts`):**

| method | does |
| ------ | ---- |
| `set(a, y, b, c, v, mode?)` | one block; `mode`: `REPLACE` (default), `IF_AIR`, `IF_SOFT` (air, fluids, plants) |
| `box(...)` / `room(...)` | a filled box / a hollow room (walls, floor, roof) |
| `ground(a, b, c)` | terrain height under a local point (cached) |
| `foundation(...)` | fill down from a floor to the ground, so houses don't float on slopes |
| `faced(a, y, b, c, id, axis, sign)` | stairs and ladders facing a local direction |
| `chest(a, y, b, c, table)` | a chest filled from a loot table |
| `spawner(a, y, b, c, mob)` | a mob spawner |
| `npc(a, y, b, c, mob, data)` | a villager that spawns once, the first time the column loads |
| `push()`, `shift(a, y, b, c)`, `orient(o)`, `pop()` | sub-frames; villages place each house in its own frame with `subOrient` |
| `int`, `chance`, `pick` | a seeded RNG, so the same seed always builds the same structure |

`id('name')` looks up a block id and throws on a typo (caught by the structure tests).
Builders in `builders/common.ts` include `ball` (a 4D ball), `pillar` and `weighted`.

**How it runs.** Each column generator asks the placer for starts whose radius reaches the
column. The builder records a **plan**: its writes bucketed by column, plus its markers.
The plan is cached (LRU of 40), so a village is built once while its columns stream in.
Each column then applies only its own writes and markers.
* Chests get their loot rolled, deterministic per seed and position.
* Spawners become block entities.
* NPC markers become villagers when the column arrives on the main thread. The column is
  then saved without the marker, so villagers never respawn.

## 3. Loot tables

```ts
cabin: T([{ rolls: [3, 6], entries: [
  { item: 'bread', weight: 8, count: [1, 3] },
  { item: 'iron_axe', weight: 1, wear: [0.3, 0.8] },
] }]),
```

Each pool is rolled `rolls` times, with weighted picks. `wear` pre-damages tools, as a
fraction of their durability. Stacks land in random slots of the 27-slot chest.

## 4. Test it

* `npm test`. `tests/unit/structures.test.ts` finds the nearest start of every structure
  for a fixed seed. It builds each plan and checks that:
  * the writes stay within the radius;
  * the chest tables exist;
  * the spawner and villager mobs exist.
* In game, find it with the test API: `__hc.locate(['cabin'])`, then
  `__hc.travel(x, y + 2, z, w)` with `?test=1`. Or hold a matching atlas. To add the
  structure to an atlas, put its name in the `atlas` list of an atlas item in `items.ts`.
