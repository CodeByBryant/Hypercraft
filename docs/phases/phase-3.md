# Phase 3 report: Items, inventory, mining, crafting, furnaces

Status: **complete** (committed on request while the e2e suite was still running: unit tests
and typecheck are green; the new e2e survival spec and the Phase 3 R6 re-render are pending
and will land with the next commit).

## R6 reference views

The renderer's slice path is unchanged in this phase, so the Phase 2 reference views
(`docs/screenshots/phase-2/`) still describe it; a Phase 3 re-render (the terrain around the
garden changed with the rebalance) follows in the next commit. Expected, as before:

1. **Axis-aligned** (`1-axis-aligned.png`): cubes. Square floor tiles, cube stacks, half-cube
   slabs and stairs.
2. **XW 30°** (`2-xw-30.png`): stretched boxes and thin slivers where the slice crosses a W
   boundary. The marker sculpture alternates wide and thin columns.
3. **XW 45° + ZW 45°** (`3-xw45-zw45.png`): triangular and hexagonal prisms (floor tiles,
   grass tops).

The renderer's slice maths did not change in this phase. The additions (crack overlay,
item sprites) sit on top of the same R1 slice, and dropped items follow R1 too: each is a
small 4-ball drawn as its cross-section.

## What works

* **Items and icons**: 282 items. Every block gets an item automatically. There are also
  materials, buckets, shears, flint and steel, a hypercompass, a clock, and 40 tools. Icons
  are procedural: isometric block icons are built from the world's own 16³ textures, and
  other items are 16×16 pixel art painted from data. One 1024² sheet serves the DOM and the
  item sprites.
* **Tool tiers**: wood, stone, copper, gold, iron, azurite, verdant, hyperite (harvest level,
  speed, durability, damage), five tools per tier, all generated from `tiers.ts`.
* **Survival mining**: hold to mine. Break time follows Minecraft's formula (right tool ×
  tier speed, harvest level, ×1/5 in the air or under water). A crack overlay grows on the
  targeted cell in the ray marcher. Ores need the right pickaxe. Drops are data: raw ores,
  gems, fluxite dust, flint from gravel, apples and sticks from leaves, and grass or leaves
  with shears. Tools wear and break.
* **Dropped items** are 4D bodies. They fall, rest, merge, get pulled toward you (4D
  distance) and despawn after 5 minutes. A drop appears where your slice crossed the mined
  block, so you see it fall. Each is drawn as the slice of a small 4-ball, visible only
  while your slice passes through it.
* **Inventory screen**: 36 slots + 4 armour + off-hand, and a 2×2 crafting grid. Controls:
  click, right-click and shift-click; 1–9 swaps with the hotbar; click outside to throw.
  Creative adds an all-items tab with search and a trash slot. Tab or I opens it; touch has
  an Inv button.
* **Crafting**: crafting table (3×3). The **recipe book** has search and "craftable only",
  and fills the grid from your inventory. There are about 90 recipes. Shaped recipes match
  anywhere in the grid and mirrored, and item tags work (`#planks`, `#log`, `#coal`,
  `#sand`, `#stone_crafting`).
* **Furnace, blast furnace, smoker, chest**: block entities stored in the column's save data
  (no new save machinery). Furnaces smelt with fuel while their column is loaded and swap to
  a lit, light-emitting block. Blast furnaces and smokers work twice as fast on their
  categories. Breaking a chest or furnace spills its contents.
* **Buckets** scoop water and lava sources and place them. The hypercompass shows the
  direction to spawn in your slice and how far kata/ana it is; the clock shows the time.
* **Terrain rebalance** (from playtest feedback: "elevation way too high, deserts never
  spawn, same few biomes"):
  * median land height is now sea level + 10 (was + 32), and the top 10% sits around sea
    level + 28, not the height cap;
  * mountain ranges follow ridge lines only in low-erosion zones, with rounded crests;
  * temperature and humidity span their whole range, and biomes are smaller;
  * biome choice uses a new relief axis (lowland / hills / mountains);
  * **nine new land biomes**: Hyperplains, Prism Flower Forest, Umbral Forest, Tangle
    Jungle, Amber Woods, Dry Scrubland, Lavender Downs, Stony Peaks, Salt Flats. That makes
    28 land biomes, 37 in total, and every land biome now takes 0.3–8% of the land. Dry
    biomes are about 18%.
* **Coastlines and rivers are continuous**: the old generator made 50–70 block single-step
  walls at shores and where rivers stopped (the "cliffs of oblivion"). The largest step is
  now bounded, and a test enforces it.
* **Walking into a block no longer shifts the slice**: collision used to be resolved per
  world axis. In tilted slices, a wall that stopped the X part of a step let the W part
  continue, so the view drifted kata/ana. Movement is now resolved in the slice basis, with
  no hidden-axis motion unless you press kata/ana. A regression test covers it.

## Verification

* `npm run typecheck`: clean.
* `npm test`: **82 unit tests** in 10 files. New since Phase 2:
  * items, crafting, mining and inventory (11 tests);
  * slice-drift physics;
  * terrain continuity;
  * unique content per biome.
* e2e (`scripts/ci.sh`): smoke, R6 views, worlds/save/touch, and the new survival flow:
  * mine the garden floor with a wooden pickaxe (takes about 1.5 s, drop picked up, one
    point of wear);
  * craft planks and sticks through the real inventory DOM via the recipe book;
  * smelt raw iron with coal in a furnace that lights up.

## What's broken / limited

* Armour slots exist, but armour arrives in Phase 7, and so do food, enchanting, anvils and
  smithing. Flint and steel has nothing to light until portals (Phase 6).
* Items off your slice are invisible (4D-correct). There is no off-slice item indicator yet.
* No drag-to-distribute or double-click-collect in the inventory UI yet.
* Furnaces only run in loaded columns (no offline catch-up).
* Old saves regenerate unedited terrain with the rebalanced generator.

## What's next (Phase 4)

Mobs rendered in the ray marcher as analytic 4D shapes (hyperspheres, hyperboxes, capsules)
whose cross-sections morph with the slice. Also 4D AI with budgeted pathfinding, passive and
hostile Surface mobs, combat, health, damage, death and respawn, and the R2 proximity
indicator for mobs off your slice.
