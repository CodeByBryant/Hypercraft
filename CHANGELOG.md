# Changelog

## 0.4.1 — Mobile controls overhaul, mob visibility, icons (2026-09-29)

### Fixed (playtest feedback)
- **Hotbar taps on touch screens** now select the slot. The full-screen touch zones used to
  sit on top of the hotbar and swallow every tap.
- **Every screen can be closed on touch**: inventory, crafting table, chest and furnace have
  a ✕ button. Before, only Esc, Tab or I closed them.
- **No more ghost taps**: the inventory and pause buttons act when the tap completes, so the
  same tap no longer presses a button in the screen it just opened.
- **Sheep and other passive mobs stop popping in and out of view.** Near your slice,
  wandering mobs (animals, and hostiles that have not noticed you) wander *inside* it and
  settle into it when a little off. Fleeing animals flee inside it too. Knockback is gentler
  and stays in the slice. Near you, mobs keep their own w axis on your hidden axis, so you
  see their designed cross-section (legs, heads) instead of a random oblique cut.
- **More passive mobs, easier to find**: the passive cap rose from 12 to 20, spawn
  attempts from 6 to 8 per cycle, and half of them land in your current slice (herds
  spread inside it). Passive mobs despawn beyond 96 blocks, so the cap refills near you.
- **Item icons**: the torch was a solid brown, yellow and white square. It now has a
  pixel-art icon, and so do lanterns, fences, campfires and cobwebs.

### Changed (touch controls)
- **Tap to interact**: tap a mob to hit it, or tap a block to use or place right where you
  tapped. The ray goes through your finger, not the crosshair.
- **Long-press mines the block under your finger**; slide the finger to move to the next
  block.
- **Aim assist**: a near miss on a visible mob still hits (0.45 blocks on touch, 0.12 with
  a mouse). It never reaches mobs off your slice.
- **New thumb cluster**: Kata / Ana / Sneak, then ⛏/⚔ Hit (turns red on a mob) / ✋ Use /
  Drop, then a wide Jump. Use is a hold button, so bows can be drawn.
- **Screens**:
  - a faint ring shows where the move stick is;
  - screens scale to fit phones;
  - the recipe book is a toggle on small screens (it was hidden before);
  - holding a slot splits it, and **Quick move** makes taps move whole stacks.
- The Fly button only shows in creative and spectator; the game-mode label moved off the
  hotbar.
- `?test=1&touch=1` shows the touch controls in test worlds, and a new e2e spec drives them
  with real touch events on a phone-sized screen:
  - hotbar taps;
  - closing the inventory and crafting table with ✕;
  - tapping a mob off the crosshair to hit it;
  - tapping to place;
  - long-press mining.

### Added (early Phase 5 content)
- Building blocks, craftable now:
  - stone bricks (plain, mossy, cracked, chiseled);
  - thatch, plaster, dirt path and hay bale;
  - bookshelf, lantern, fence and campfire;
  - sea bricks and sea lantern, tesseract bricks and gilded bricks;
  - red and blue wool.
- Paper, books, wheat (from wild wheat) and bread.
- The mob spawner block (no item).

## 0.4.0 — Phase 4: Mobs, combat, health (2026-09-29)

### Added
- **Mobs in the ray marcher.** Each mob is a union of analytic 4D primitives (boxes, balls
  and capsules) in its own rotated 4D frame. Up to 48 per frame are uploaded to an RGBA32F
  entity texture and intersected exactly, per pixel, in the same pass as the terrain. Their
  cross-sections change with the slice, and they are lit by the cell they stand in.
- **28 Surface mobs** spawned from biome tables on a 4D shell around you (day, night, water
  and cave tables; hostile and passive caps).
  - Passive: Kata Sheep, Ana Cows, egg-laying Hyperchickens, light-seeking Glass Moths,
    splitting Kata Slimes, Tesseract Rabbits, Bog Frogs, Frost Foxes, Dune Camels,
    Hyperhorses, Reef Squid, Lantern Fish, Hyperbats.
  - Hostile: Shamblers (burn by day), Bone Archers (arrows), the **Ana Stalker** (a thin
    hyperbox that lurks along your hidden axis and is invisible until it steps into your
    slice), **Phase Creepers** (the fuse pulses through W, then a 4D explosion), **Web
    Weavers** (climb walls and spin cobwebs, often kata or ana of you), Hollow Husks,
    Frostbite Wraiths, Marsh Leeches, Slime Hordes, Drowned Sentinels, Lava Slimes, the
    **Phase Golem** (only hurt while its cross-section is in your slice), Crystal Crawlers,
    the blind **Lurker** (hunts noise: mining, sprinting, fights, explosions) and **Ore
    Mimics**.
- **4D AI**: a budgeted A* over the 4D voxel grid (routes around walls through W) and 12
  behaviour profiles (passive, melee, climber, golem, ranged, exploder, stalker, hopper,
  flyer, swimmer, mimic, lurker). Procedural limb animation.
- **Combat**:
  - weapon damage by tool kind and tier;
  - Minecraft-style swing cooldown, and critical hits while falling;
  - knockback kept inside the slice;
  - weapon wear, drops and death puffs.
- **Bow**: hold right click to draw (1 s for full power), arrows use ammo, stick in blocks
  and can be picked up.
- **Health and air**:
  - 10 hearts with natural regeneration, and air bubbles underwater;
  - damage from mobs, arrows, explosions, falls (1 per block beyond 3), lava, cactus and
    magma, drowning and the void;
  - the damage flash shows which side (kata or ana) a hit came from.
- **Death and respawn**: the inventory spills where you died, and a death screen offers
  respawn (hardcore: spectator mode). Health and air are saved with the world.
- **R2 proximity warning** for hostile mobs out of your slice:
  - a violet pulse on the kata (left) or ana (right) screen edge, stronger when closer;
  - red dots on the hidden-axis radar;
  - a line at the top of the screen, for example "⚠ Ana Stalker · 6 m away, 5 m ana".
- **Cobwebs** slow movement to 15% and stop falls; they show on the radar.
- Particle bursts for hits, crits, deaths and explosions (4-balls launched inside the slice).
- Tests:
  - unit: mob registry, GPU packing and culling, ray picking in rotated frames, the stalker
    frame, slice-bound damage, knockback, drops and slime splitting, mob physics, web
    spinning, combat maths, vitals, cobweb physics;
  - e2e: mobs in the three R6 views, sword kill with drops and wear, stalker warning,
    bow, explosion crater and damage, death screen and respawn.

### Changed
- Help screen and README describe mobs, combat and the violet warnings. The toast and held
  item readout moved up to make room for hearts.
- Quadrupeds stand on six legs: four in their own w = 0 plane plus one toward each of ±w.
  Humanoids and birds stand on a tripod (two legs plus a heel toward +w).

### Fixed
- Paused, dead or inside a screen: the last movement keys no longer keep the player walking.

## 0.3.1 — Mac placing fix (2026-09-29)

### Fixed
- iPad/iOS: repeated taps no longer zoom the page (viewport locks scaling, `touch-action`
  on every game surface, and Safari gesture/double-tap events are cancelled in script).
- Placing blocks on Mac: Ctrl+click and Cmd+click now count as the secondary (right) click,
  and a trackpad two-finger tap that only sends a context-menu event places once.
- Inventory grids stay compact; how-to-play mentions the Mac secondary click and the survival
  start (empty inventory).
- e2e: the Phase 3 survival spec (mining, recipe-book crafting, furnace) now passes.

### Added (groundwork for Phase 4)
- Mob definitions for 28 Surface mobs as analytic 4D bodies, the mob registry with
  validation, a 4D A* pathfinder (unit-tested: it routes around walls through W), ray vs
  4D ball/box/capsule intersection, mob drop items, bow, arrows, wool and cobwebs.

## 0.3.0 — Phase 3: Items, inventory, mining, crafting, furnaces (2026-09-29)

### Added
- **Items**: 282 items (every block gets an item, plus materials, buckets, shears, flint and
  steel, a hypercompass and a clock) with procedural pixel-art icons and isometric block
  icons built from the world textures.
- **Tool tiers**: wood, stone, copper, gold, iron, azurite, verdant, hyperite (pickaxe, axe,
  shovel, hoe, sword each), with harvest levels, mining speed and durability.
- **Survival mining**: Minecraft-style break times (tool kind and tier, in air and under
  water penalties), crack overlay on the targeted block in the ray marcher, harvest levels
  (ores need the right pickaxe), data-driven drops (`mining.ts`: raw ores, gems, flint from
  gravel, apples and sticks from leaves, shears for grass and leaves), tool wear.
- **Dropped items** as 4D bodies: they fall, rest, merge, get pulled to you and despawn after
  five minutes. Each is drawn as the slice of a small 4-ball (an icon sprite that shows only
  while your slice passes through it). Drops appear where your slice crossed the mined
  block. B drops the held item (Ctrl+B the stack).
- **Inventory** (36 slots + armour + off-hand) with a 2x2 crafting grid; **crafting table**
  (3x3); **recipe book** with search and "craftable only"; click/right-click/shift-click
  slot handling, 1-9 hotbar swaps, throw by clicking outside; creative "All items" tab.
  Tab or I opens it; touch has an Inv button.
- **Recipes**: ~90 shaped/shapeless recipes (planks, sticks, stations, tools for every
  tier, storage blocks, buckets, compass, clock, building blocks) and smelting. Shaped recipes
  match anywhere in the grid and mirrored.
- **Furnace, blast furnace, smoker** and **chest** block entities stored in the column save
  data; furnaces smelt while their column is loaded and light up (lit block variant).
- Buckets pick up and place water/lava sources; hotbar shows icons, counts and durability;
  hypercompass shows the direction to spawn in your slice plus how far kata/ana it is; clock.
- New blocks: crafting table, furnaces (+ lit), chest, birch/spruce/acacia planks, seven
  storage blocks.
- **Nine new land biomes**: Hyperplains, Prism Flower Forest, Umbral Forest, Tangle Jungle,
  Amber Woods, Dry Scrubland, Lavender Downs, Stony Peaks, Salt Flats (37 biomes in total),
  with 40 new blocks, plants and five new trees (dark oak, jungle, maple, amber oak,
  juniper).
- Tests: items/crafting/mining/inventory unit tests, slice-drift physics regression test,
  terrain continuity test, e2e survival mining + recipe-book crafting + furnace smelting.

### Changed
- **Terrain rebalanced** (feedback: too high, no deserts, same few biomes): median land
  height is now sea level + 10 (was + 32), mountain ranges only follow ridge lines in
  low-erosion zones, temperature/humidity use the full range so deserts, salt flats and
  scrubland are common, biomes are smaller, and biome choice uses a new relief axis
  (lowland / hills / mountains). Worlds from 0.2 regenerate different terrain.
- Coastlines and rivers are continuous: no more 50-70 block walls at the shore or where a
  river used to stop at a mountain threshold.
- Walking into a wall in a tilted slice no longer drifts the view along the hidden axis:
  horizontal collision is resolved in the slice basis (forward/right/hidden) instead of per
  world axis, and hidden-axis velocity is dropped unless you press kata/ana.
- Creative worlds start with a starter kit instead of the fixed block palette; survival
  worlds start empty. Old palettes load as stacks of 64.

## 0.2.0 — Phase 2: Surface terrain (2026-09-28)

### Added
- **4D climate**: continentalness, erosion, ridged peaks, temperature, humidity and
  weirdness as fBm over (x, z, w), plus an "ana bias" field that varies ~9x faster along W,
  so kata/ana walks cross biomes faster than X/Z walks. Smooth fields are sampled on a
  4-block lattice anchored to world coordinates (seamless across columns).
- **27 biomes** (19 land, 5 ocean, 3 underground), chosen by nearest climate point with
  `1/d⁴` blending of height and colours: Meadow, Tesseract Forest, Birch Glade, Orchard
  Hills, Cherry Grove, Glass Marsh, Mushroom Fen, Dense Taiga, Snow Taiga, Ice Plains, Frost
  Spires, Weathered Steppe, Savanna, Bamboo Thicket, Dune Sea, Sunscar Mesa, Bone Desert,
  Volcanic Highlands, Hollow Peaks; Ocean, Deep Ocean, Frozen Ocean, Coral Shallows, Kelp
  Deep; Lush Caves, Dripstone Caves, The Silent Layer.
- Terrain styles: dunes whose crests shift with W, terraced mesas with W-shifting
  terracotta bands, marsh flats, stepped steppe, volcano cones with lava craters, frost
  spires, W-banded floating islands (Hollow Peaks), rivers carved to below sea level.
- **4D caves**: cheese hyper-caverns, worm tunnels (intersection of three zero sets = curves
  in 4D), fissures, **Ana Sheets** (huge cavities one or two blocks thin along W, wide in X
  and Z), ravines (water-filled trenches under the sea), sinkholes, lava lakes below y 10,
  flooded humid caves; data-driven cave biomes decorate floors and ceilings (`ceiling` block,
  floor/ceiling plants, trees).
- **Lakes**: contained 4D bowls above sea level (frozen in cold biomes).
- **Ores** as 4D capsule veins with depth ranges (coal, copper, iron, gold, azurite,
  fluxite, verdant in mountains, hyperite) and deep variants near bedrock; geodes (shell,
  calcite, amethyst, clusters), fossils in the Bone Desert.
- ~170 new blocks (stones, soils, turf per biome, terracotta, corals, logs/leaves for 8 wood
  types, cactus, bamboo, kelp, seagrass, anemones, flowers and glowing plants, ores); every
  biome has at least 3 unique blocks and 2 unique plants (unit-tested); 16 tree archetypes
  with 4D canopies (ball, birch, cone, acacia bending into ±W, wide, bamboo, giant mushrooms,
  dead trees, cactus, kelp).
- **Ambient particles** per biome (dust, leaves, petals, snow, ash, spores, fireflies,
  embers, bubbles, motes), each a tiny 4-ball drawn as its slice disc, so they swell and fade
  as they drift through your slice; *Particles* setting (all/reduced/off).
- F3 shows the world seed, the cave biome underground and particle counts.
- Unit tests: 15 world-generation tests (determinism, all biomes occur, underground biomes,
  caves, Ana Sheets, ore depths, rivers, lakes, vegetation, spawn on dry land, speed), 3
  particle tests, unique content per biome.

### Changed
- Generator is `surface` (Phase 1's `surface_phase1` is gone): worlds created with 0.1.x
  regenerate with the new terrain; edited columns from old saves keep their old contents.
- Column generation optimised (segmented fills, shared cave-field interpolation, hoisted
  ids): about 44 ms per column in Node.
- The engine test garden (test worlds only) now searches for a flat dry site and covers the
  spawn point; e2e views/bench are spawn-relative.
- Brick pools start larger (sized for Phase 2 terrain) to avoid regrow stalls.

## 0.1.1 — Controls, seeds, worlds, touch (2026-09-28)

### Changed
- WASD is movement only; the arrow keys now turn the camera (yaw/pitch).

### Added
- Title screen with a live 4D demo world behind it; world list (play, export, delete,
  import); create-world screen with seed field, random seed, seed ideas, game mode,
  difficulty, hardcore and cheats flags.
- Seeds: integers are used as-is, any other text is hashed.
- IndexedDB saves: edited columns (gzip-compressed, block-name palette so saves survive
  content changes), player position/orientation/mode, time, weather and hotbar; autosave
  every 30 s and on pause/hide/quit; `.hcworld` export/import.
- Touch controls: floating move stick, drag-to-look, tap/long-press to place/break,
  two-finger slice rotation, button cluster; touch-specific HUD layout.
- Settings screen (FOV, sensitivity, render distance, internal resolution, outlines,
  vignette, pixelated upscaling, invert Y, touch controls) and pause menu.
- Tests: seed parsing, column codec round-trip and palette remap, e2e world
  create → edit → save → reload, touch layout.

## 0.1.0 — Phase 1: Engine (2026-09-28)

### Added
- Vite + TypeScript project; shaders as `.glsl` strings; no UI framework.
- 4D math: vectors, seeded hashing/PRNG, simplex noise (2D/3D/4D, fBm), upright 4D camera
  frame (yaw, pitch, slice tilts, world-plane rotations, snap to axes), tesseract/box
  cross-section polytopes and analytic edge rates.
- Data-driven content registries (blocks, shapes with orientation variants, procedural 16³
  textures, biomes, realms) with validation and GPU tables.
- Brick-sparse 16⁴ chunk storage, 8-chunk columns, infinite X/Z/W with a toroidal window.
- Web Worker generation pool (deterministic per seed), slice-aware streaming priority,
  column-local light in workers.
- Phase 1 Surface generator: 4D heightfield, 4 test biomes, 4D cheese caves with lava below
  y 10, ore blobs, 4D-ball trees, tall grass, frozen water, and the engine test garden.
- GPU layout: chunk table, brick table, block/light brick pools, surface (biome colour) map,
  block info, shape table, texture atlas.
- Ray-march renderer: hierarchical 4D DDA with chunk/brick empty-space skipping, analytic
  sub-voxel shapes, cutout/translucent/fluid handling, smooth 4D lighting and AO, polytope
  outlines, P wireframe mode, 4D sky (sun, moon phases, stars, clouds), fog, weather effects,
  composite pass, polytope line overlay, adaptive resolution scaler, GPU timer.
- Main-thread light engine (seams between columns, edit removal/re-propagation).
- Cellular 4D fluids (water, lava) on a tick budget.
- Player physics (4D hyperbox: gravity, jump, swim, climb, sprint, sneak edge protection,
  step-up, creative flight, spectator).
- Picking (CPU 4D DDA) with break/place/pick-block and orientation-aware placement.
- HUD: crosshair, hotbar, hidden-axis compass and radar, hazard edge warnings, F3 debug
  overlay, loading and pause screens.
- Test API (`window.__hc`), in-game benchmark (`?bench=1`), allocation profiler script.
- Unit tests (56), Playwright smoke/R6/bench specs, `scripts/ci.sh`, GitHub Actions workflow.
- Docs: architecture, GPU layout, 4D rendering, data formats, how-tos, Phase 1 report and
  benchmarks.
