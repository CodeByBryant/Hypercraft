# Phase 5 report: Structures, loot, villagers, trading, beds

Status: **complete**. Typecheck and all 123 unit tests are green. In the last full CI run, six
e2e specs passed: smoke, R6 views, items, mobs, touch, and the new structures spec. That
run was stopped while the worlds spec was still running, so worlds was not re-verified on
this commit.

## R6 reference views

The standard terrain views are in `docs/screenshots/phase-5/1-axis-aligned.png`,
`2-xw-30.png` and `3-xw45-zw45.png`. The new village views look at the plaza of a marsh
village (seed `villages`) from 26 blocks back and above, with mobs frozen for the shot:

1. **Axis-aligned** (`village-1-axis-aligned.png`). The road leaving the plaza, with a lamp
   post. You can see a thatch-roofed house on the right and trees around the plaza, and the
   marsh's mint-tinted grass.
2. **XW 30°** (`village-2-xw-30.png`). The same village, tilted through W. Roads along ±W now
   cross the slice, so houses from the plaza's kata/ana streets come into view.
3. **XW 45° + ZW 45°** (`village-3-xw45-zw45.png`). Oblique cuts through two houses on stilts.
   Their walls and 4D hip roofs are cut into slanted slabs, and the stilts slip out of the
   slice.

Other shots:
* `trade-screen.png`: a W-Walker's trade screen. It shows the level bar, your standing, and
  two offers: the affordable one outlined in green, the other dimmed. The inventory is below.
* `bed.png`: a red bed on the plaza. It is one cell: a wooden base, a mattress, a quilted top.
* `sleeping.png`: the sleep fade with the "Leave bed" button. Behind it, the toast from the
  refusal a moment before: "You may not rest now: a Shambler is nearby (3 m kata of your
  slice)".
* `dungeon.png`: inside a dungeon, lit by two lanterns placed for the shot. You can see the
  mossy cobblestone room and the spawner cage. The Ruins Atlas readout says
  "🗺 Dungeon ↗ 1 m (in this slice)".

## What works

### Beds and sleeping (playtest request)

* **Getting a bed.** Red, blue and white beds are crafted from 3 wool over 3 planks, and
  village houses, cabins and igloos have them.
* **Sleeping.** Right click at night (ticks 12500–23450) or in a thunderstorm. The screen
  fades out over 2.2 s, then the world jumps to the next sunrise, storms clear, and the
  screen fades back in over 1.3 s.
* **Getting up early.** Jump, sneak, or the **Leave bed** button (for touch) gets you up
  before the jump, and taking damage wakes you.
* **Respawn point.** Using a bed at any time makes it your respawn point; it is saved as
  `player.data.bed`. If the bed is gone when you respawn, you wake at the world spawn with a
  message. The hypercompass points to your bed.
* **R2.** A hostile within 8 blocks (x, z and w) and 5 up or down blocks sleep. The refusal
  names the mob and gives its kata/ana offset from your slice, so an invisible monster is
  never a mystery.

### Structures (data-driven)

* **Placement** (`src/content/structures.ts`). 32 structures, each with a placement kind
  (surface, beach, underwater, underground, sheet), a spacing, a chance, a builder, a radius
  and a salt.
* **The grid is 4D**: one attempt per spacing³ cell of (x, z, w), deterministic from the
  seed. The biome at the start must list the structure (`BiomeDef.structures`).
* **Builders** write in a local frame (a, y, b, c) and are placed in one of the 48 horizontal
  orientations of 4D space. In 4D a room has six walls, and a door in a ±c wall is only
  reachable by moving kata/ana.
* **Per-column plans.** A structure is built once into a **plan**: its writes bucketed by
  column, plus markers (LRU cache of 40 plans). Each column applies its own bucket, so a
  village spans many columns without seams.
* **Villages** (7 styles). A plaza with a 4D well, and roads along all six horizontal
  directions, so a village is a 3D cross of streets. Houses line each road on four sides.
  There are 8 building kinds, each housing a villager whose profession matches the building.
* **Everything else** (25 kinds):
  * cabins, watchtowers, witch huts, windmills (4D rotor), campsites, igloos, outposts;
  * stone circles, standing slabs, fossil sites, lighthouses, buried treasure;
  * desert temples, jungle shrines, tesseract grove temples, ruined portals, ancient ruins,
    sky towers;
  * shipwrecks, sunken monuments;
  * dungeons, hypermines, library ruins, deep silent vaults, and **Ana Vaults**, which can
    only be entered through an Ana Sheet.

### Loot, spawners

* **Loot.** 30 loot tables with pools, rolls, weights, counts and pre-worn tools. Chests are
  filled in the worker when the column is generated, deterministic per seed and position.
* **Spawners** are block entities. They spawn 1–4 of their mob within 3 blocks every
  10–40 s, while you are within 16 blocks and fewer than 6 of that mob are near. Breaking
  the block removes its entity.

### Villagers and trading

* **Spawning.** Villagers spawn from the village's NPC markers the first time their column
  loads. The column is then saved without the markers, and villagers are **saved** in their
  column's data (the first persistent mobs).
* **Professions.** Farmer, smith, librarian, cartographer, cleric, mason, fletcher and
  W-Walker. Each has robe and trim colours and five levels of trades, with Verdant as the
  currency. A villager starts with two offers and unlocks two more per level
  (XP thresholds 10 / 70 / 150 / 250).
* **Prices** depend on:
  * reputation: +1 per trade, −5 for hitting the villager, −2 for the rest of its village.
    That means up to 35% off when you are liked, and up to 50% more when you are not;
  * demand, which rises when an offer sells out between restocks. Offers restock twice a day.
* **Behaviour.** Villagers flee monsters, head home at night, and stop to face you when you
  come close.
* **The Wandering Merchant** turns up some mornings nearby with six random offers, and
  leaves after about a day and a half.
* **Atlases** (village, temple, vault, ruins) are sold by cartographers and librarians, and
  found in chests. The readout gives the nearest marked structure's direction in your slice,
  its distance and its kata/ana offset. The search runs in a generation worker, so it does
  not hitch the frame.

### Tests

* **Unit tests.**
  * Structures: every biome's structures exist, there are 48 distinct orientations,
    placement is deterministic, every structure stays within its radius with valid loot and
    mobs, a village writes paths into its columns, and villages have beds.
  * Loot tables.
  * Trading: levels, prices, restock and the merchant.
* **E2E** (`tests/e2e/structures.spec.ts`), with seed `villages`:
  * finds a marsh village and counts 375 path blocks around its plaza;
  * checks that 13 villagers spawned;
  * takes the three R6 shots;
  * trades with a W-Walker by clicking the offer;
  * sleeps through a night (day 0, 18:00 → day 1, sunrise);
  * gets refused while a Shambler is 3 m kata;
  * dies and respawns at the bed;
  * reads a Ruins Atlas;
  * checks a dungeon's web-weaver spawner and a loot chest, and that the spawner spawns.

## What's broken / limited

See [KNOWN_ISSUES.md](../../KNOWN_ISSUES.md) (Structures, villagers and beds). The main
points:
* Trees and plants can poke through structures.
* Villagers have no schedules, gossip or breeding.
* A bed is one cell, and sleeping skips time without catching up furnaces.
* Structures add about 10–13 ms per column in structure-dense areas (worker time).

## What's next

Phase 6: the Ember Depths realm, portals (8:1 in x, z and w), its biomes, mobs and
structures, and the Magma Regent boss.
