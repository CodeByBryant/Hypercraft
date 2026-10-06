# Changelog

## 0.7.1 — The livable world (2026-10-06)

Playtest feedback after Phase 7: the world had grown wide without the basics that make it
coherent and survivable.

### Added
- **Wood families.** Every tree makes its own planks, stripped log (use an axe on a log), slab,
  stairs, fence and a two-cell door: 33 woods, one table (`src/content/woods.ts`). Doors open
  and close with use and keep mobs out (villages have them). Every log, plank and leaf block now
  has a mining rule; stone and crystal "trunks" are pickaxe blocks, not logs.
- **Food that is food.** Blueberry, cranberry and lingonberry bushes are real berry bushes;
  fruit trees drop their fruit (cherries, olives, coconuts, baobab fruit); cacti, sunflowers,
  glow berries, sea grapes and puffballs are edible; long grass gives plant fibre (3 make a
  string). New dishes: berry pie, fruit salad, fish stew.
- **Fishing.** The fishing rod: cast at water, wait for the splash, use again to reel in fish,
  salmon, junk or treasure.
- **Eight new animals**: wild boar, ridge deer, crag goat, mallard, steppe bison, shell turtle,
  shore crab, floe penguin, with raw and cooked meats; every land biome lists two to four animals
  that fit it, and about one land column in five arrives with a herd.
- **Terrain.** Biomes about three times larger, caves that open to the surface (mouths in
  hillsides, ravines open to the sky), rivers of varying width with a stream network, gorges and
  islets, many more and larger lakes (with sandy shores and lava lakes in volcanic highlands),
  and waterfalls down cliff faces.
- **Survival.** A Minecraft-shaped day (about ten minutes of full light, seven of dark), gentler
  nights (hostiles only in the dark, further away, fewer; no ana stalkers the first night),
  **graves** (everything you carried waits in a grave, a HUD pointer leads back to it), a
  **keep inventory** world option, the **sleeping bag**, and a starter kit in new survival
  worlds (torches, bread, a crafting table, a sleeping bag).

### Changed
- Torches and lit rooms keep hostiles from spawning (block light 0 is required); the hostile cap
  went from 14 to 10 and the passive cap from 20 to 28.
- Lakes are stretched along W so one stays in view across many slices.

## 0.7.0 — Phase 7: Survival systems, enchanting, brewing, farming, animals, smithing, 4D tools (2026-10-02)

### Added
- **Items carry data**: enchantments, custom names, armour trims, anvil work, W-Anchor marks
  and crossbow ammunition travel with a stack (saved, shown in tooltips).
- **Armour**: helmets, chestplates, leggings and boots in leather, copper, gold, iron, azurite,
  verdant, hyperite and Ancient Slag (smithing only), with Minecraft's armour and toughness
  formula. Sets: Ancient Slag (fire immunity, lava swimming), the Reefshell helmet (breathe
  longer underwater). Right click armour to put it on.
- **4D Glasses** (a helmet): every mob within 32 blocks drawn as a wireframe of its whole 4D
  body, wherever your slice is; tinted bluer kata, pinker ana.
- **Hunger and saturation** with Minecraft's exhaustion rules (sprinting, jumping, fighting,
  mining), natural regeneration when fed, starvation; 29 foods (hold use to eat), golden
  apples, stews, milk.
- **Experience**: orbs from ores, mobs, smelting, breeding and trading; Minecraft's level curve;
  you drop some when you die.
- **Status effects** for you and mobs: speed, slowness, haste, mining fatigue, strength,
  weakness, regeneration, poison, wither, hunger, blindness, instant health and damage, jump
  boost, slow falling, fire resistance, night vision, invisibility, water breathing, absorption,
  resistance, saturation, and the
  4D ones: **Phase Sight** and **Anchor** (resist being shoved along W). HUD badges.
- **Enchanting**: the enchanting table (azurite and levels; bookshelves count anywhere in a 4D
  shell around it, up to 15), Minecraft's offer algorithm, 32 enchantments, among them the 4D
  ones: **4D Vision** (helmets but the glasses: mobs and key blocks such as furnaces, chests,
  tables and stations, wherever they are in 4D), **Slice Sense** (ores in the slices next to
  yours), **Phase Strike** (hit a mob kata or ana of your slice, once a second), **Kata Grip**
  (resist W shoves), **Reach Through** (reach blocks through the hidden axis). Enchanted books
  (librarians, loot), the **anvil** (combine, repair, rename; "Too Expensive!" at 40) and the
  **grindstone** (strip enchantments for experience).
- **Brewing**: the brewing stand (Cinder Powder fuel), Ember Wart and the awkward base, 20
  potion types in plain, extended (Fluxite Dust) and enhanced (Emberglass or Lumen Dust)
  forms, Fermented Weaver Eye corruptions, splash potions (Sulfur), Bottles o' Enchanting.
- **Farming**: hoes, farmland that hydrates from water within 4 blocks in all four directions
  (a 9×9×9 shell), wheat, carrots, potatoes, beetroots, melons and pumpkins (stems), Ember Wart
  on soul sand, berry bushes, 18 saplings that grow their biome's trees, bone meal, trampling.
- **Animals**: breeding with each animal's food, babies that grow up, tempting, leads (tie
  them to fences), shearing, milking, eggs that hatch chicks, name tags. Animals you tame,
  lead or name are kept with their column.
- **Smithing table**: the Slag Upgrade (hyperite gear to Ancient Slag, enchantments kept) and
  eight armour trim templates in ten materials.
- **Shields** block melee, arrows and blasts from the front of your slice, in a wide arc, but
  not from the hidden axis: a mob kata or ana of you gets around it.
- **Off hand**: H (or the touch button, or tapping the HUD slot) swaps hands; the off hand
  raises its shield, eats its food or places its block (torches) when the main hand has
  nothing to do. **Torches and other lights held in either hand light your way.**
- **Anchor Charm** (the Magma Regent, rare loot): held in either hand, it cheats death once.
- **4D tools** (tesserite): **Slicer Compass** (reads your slice's orientation, snaps it
  aligned), **Phase Lens** (wear or hold: faint outlines of mobs kata and ana of you and of the
  walls in the neighbouring slices), **W-Anchor** (mark a spot in 4D, come back to it),
  **Hyper Rope** (climb ana and kata along the hidden axis, hanging), **Ana Pick** (breaks a
  3×3 sheet through the neighbouring slices).
- **Weapons**: spears (longer reach, and reach off your slice), the **4D Whip** (hits
  everything in a small hypersphere), the **Hyper-Chakram** (thrown, comes back, cuts mobs
  kata and ana of its path), throwing daggers, the crossbow.
- **Creative tabs and recipe book sections**, like Minecraft's: Building, Natural,
  Functional, Tools & Utilities, Combat, Food & Drinks, Ingredients and Technical, plus All
  with a section per category. Search looks through every tab.

### Changed
- **Far more ore.** Surface ore went from under 2% of the rock to about 7% (coal 2.2%, iron
  1.6%, copper 1.2%...), in fatter veins whose 3D cross-sections read as veins; coal moved
  down into the rock (half its veins used to land in the air). The Ember Depths' quartz,
  gilded cinder, hypercinder and Ancient Slag are 2–4x as common.
- **Four new ores, each with uses** (each with a deepstone variant):
  - *Silver* (y 6–90): ingots, nuggets, blocks; **silver arrows** (8 arrows + an ingot: 25%
    more damage, double on the undead); **Mirror Glass**; a trim material; smiths buy it.
  - *Sulfur* (y 2–60): **TNT** (sulfur and sand). Light it with flint and steel, a fire
    charge, spreading fire or another blast; it blows after 4 s (a 4D radius-4 crater), and
    TNT in a blast chains. Also fire charges and splash potions.
  - *Lumenite* (y 10–110, glows in the dark): lumen dust. Four make a Lumen Block (which
    breaks back into dust); **spectral arrows** (an arrow and four dust: the mob you hit glows
    for 10 s, outlined through walls and off your slice); enhances potions like emberglass
    dust.
  - *Tesserite* (y 2–40, rare, violet glow, iron pickaxe): tesserite shards, Tesseract Blocks,
    phase dust (one shard: two), and the 4D tools (Phase 7.7).
  - Bows shoot the off hand's arrows first, then the hotbar's, like Minecraft; Infinity only
    saves plain arrows. Fletchers, clerics and W-Walkers trade the new things; chests hold them.

### Performance
- **Buried bricks cost nothing on the GPU.** Solid rock with ores, veins and fossils inside,
  behind a plain stone face, is stored as one value: about a third fewer GPU bricks on the
  Surface and in the Ember Depths, and the spectator's x-ray view from inside rock does
  35–50% less ray marching (it crosses buried rock a brick or a chunk at a time). Renders are
  pixel-identical (an e2e test compares them, before and after digging into hidden ore).
- **Brick pools grow in place** (a GPU copy) instead of re-uploading the whole world, so the
  starting size is smaller (≈30% less GPU memory at the same render distance) with no stall
  when it fills up. Full pools no longer crash the game.
- **Mobs off screen are not traced**: every pixel tests every mob handed to the ray marcher,
  so mobs outside the view frustum are left out.


### Fixed
- **The creative inventory crashed the tab** (all 900+ items): every item icon carried its
  own copy of the multi-megabyte icon sheet as a data: URL. The sheet now sits behind one
  blob: URL in a single stylesheet rule.

## 0.6.1 — Playtest fixes (2026-10-01)

### Fixed
- **Portals work like Minecraft's.** A flat obsidian frame (4 × 5, corners optional, at least
  2 × 3 of air inside) in any vertical plane of the slice now lights with flint and steel or
  a fire charge. Before, only 3D hyper-frames counted, so a Minecraft-style frame just caught
  fire. Hyper-portals still work. The arrival portal copies the shape you left through (a flat
  one gets Minecraft's corners), and breaking a block next to a flat portal that is not part
  of its frame no longer collapses it. A new e2e test lights a flat frame with the real flint
  and steel in a saved world, travels, and comes back to the same portal.
- **Fire is real.** It flickers (the ray marcher scrolls the flame texture's tongues through
  its solid third axis; magma churns the same way), and it behaves like Minecraft's, in 4D:
  - It spreads to flammable blocks (planks, logs, leaves, wool, plants, hay, bookshelves…)
    across all 8 face neighbours and jumps to nearby air that touches fuel, burns them away,
    and burns out on ordinary ground or in the rain. Fire on cinder, ember moss or magma burns
    forever. The Ember Depths' wood and plants are fireproof, like the Nether's.
  - Flammability is data: tags in `content/fire.ts` plus per-block `flammable` odds.
  - Touching fire or lava sets you burning (8 s / 15 s, 1 damage a second, flames on the
    screen); water and rain put you out. Mobs burn the same way (with flames), the undead in
    sunlight too.
  - Flint and steel lights fires on any face next to something solid or flammable, and lava
    sets nearby fuel alight as it flows. Fire that spreads into a portal frame lights it.

### Changed
- **The Ember Depths fill their whole height**, like Minecraft's Nether. There was one floor,
  one ceiling and a 50–70 block empty chasm between them; now a 4D density field (sampled
  every 4 blocks and interpolated) makes masses, overhangs, ledges, arches, pillars and
  floating islands from the lava sea to the roof. Lava lakes show wherever the ground dips
  under y 32, lava tubes run through the rock, and emberglass hangs under every overhang.
  - **Biomes are vertical too**: they are picked from heat, vapour, soul *and altitude*, on a
    4-block 3D grid, so the ledges and islands above the floor have biomes of their own (the
    Magma Sea stays low, the Shattered Tesseracts favour the heights). Fog, particles, mob
    spawns and F3 use the biome at your height.
  - Each biome's terrain shape is data (`emberTerrain`: fill, verticality, ledges, floor and
    roof heights, dunes, canyons, islands), blended across borders.
  - Generation stays at about 40–45 ms per column (about 50 ms with the 25 biomes below).
- **17 more Ember biomes (25 in all)**, each with its own surface, plants and mostly its own
  trees, spread over the height:
  - low, by the lava: **Obsidian Shoals** (glassy black sand, shards), **Lavafall Cliffs**
    (molten cascades pour off every overhang), **Boiling Mire** (slowing mud, scalding mud
    vents), **Slag Heaps** (rusty slag dunes, Slag Golems);
  - middle: **Crimson Wilds** and **Warped Woods** (giant red and cyan fungi, hanging weeping
    vines), **Bone Valley** (rib arches), **Ember Savanna** (golden straw, ashwood trees),
    **Glowstone Hollows** (glowing shards hanging from the overhangs), **Obsidian Spires**
    (4D obsidian spikes), **Magma Reef** (glowing magma coral), **Blaze Jungle** (blaze palms);
  - high, near the roof: **Hanging Gardens** (vines and lantern pods under every ledge),
    **Stalactite Forest** (dripcinder spires), **Floating Ash Isles**, **Phoenix Roost**
    (golden rock, nests of burning plumes), **Smoke Veil** (soot and haze).
- **24 more Surface biomes and 3 more oceans** (`content/wilds.ts`), each with its own
  surface, plants and mostly trees: Redwood Forest (giant 2×2×2-trunk redwoods), Mangrove
  Swamp (trees on prop roots), Baobab Savanna, Red Outback (ghost gums), Tundra, Glacier
  (raised ice sheet with crevasses), Aspen Parkland, Rainforest (emergent kapoks), Cloud
  Forest, Glowshroom Forest (giant glowing blue mushrooms), Crystal Fields (crystal spires),
  Petrified Forest, Highland Moor, Karst Pillars (towers of limestone with pines on top),
  Hoodoo Badlands, Sunflower Plains, Pine Barrens, Geyser Basin (scalding geyser vents),
  Wisteria Woods (weeping purple trees), Boreal Bog, Burnt Woods, Kaleidoscope Fields, Olive
  Groves, Palm Isles; and the Abyssal Trench, Sargasso Sea and Lantern Reef oceans.
- **12 more cave biomes (15 in all)** (`content/caves.ts`): Crystal Geodes, Mushroom
  Caverns (giant glowing cave mushrooms), Frozen Caves, Magma Caves, Glowworm Grotto, Fossil
  Galleries, Drowned Grottos, Webbed Hollows, Root Caverns, Sulfur Pits, Hyperlattice Caves,
  Salt Caverns. Each decorates cave floors and ceilings with its own blocks and grows its own
  floor and ceiling plants. Cave biomes are now picked from data: the nearest climate point in
  (humidity, weirdness, depth), and about 40% of caves stay plain stone.
- **100 biomes in all**: 52 Surface land biomes, 8 oceans, 15 cave biomes, 25 in the Ember
  Depths.
  - New tree shapes `giant`, `mangrove`, `baobab`, `pine`, `palm`, `weeping`, `spire`; new
    terrain styles `pillars`, `hoodoos`, `glacier`; Surface biomes can have `vents` too.
  - New generator features from data: plants that hang from the underside of masses
    (`placement: 'ceiling'`), vents (`vents`), molten cascades (the `falls` family) and
    tapering 4D spires (tree shape `spire`).

- **The Surface underground is twice as deep, with Minecraft-style caves and ores.**
  - The Surface is 192 blocks tall (was 128) and sea level is y 104 (was 48), so there are
    about 100 blocks of rock under your feet instead of 45. Below y 40–48 the rock turns to
    deepstone (Minecraft's deepslate), dithered across the boundary.
  - Caves follow Minecraft 1.18's recipe, in 4D: **cheese caverns** (big 4D blobs that grow
    the deeper you go), **spaghetti tunnels** and narrower **noodle passages** (each the band
    where two noise fields are both near zero, which in 4D is a thickened surface, so every 3D
    slice cuts it as winding tunnels). About 13% of the deep underground is open (plus water
    and lava), against 3–5% before. Ravines, Ana Sheets, sinkholes and rivers stay.
  - **Aquifers**: in wet regions, caves under the region's water table (y 30–80) are flooded;
    caves at y 12 and below are lava.
  - **Ores at Minecraft-like densities**: every ore is placed as small 4D vein clusters sized
    to make a set share of the rock in its height band ore (coal about 1.2%, iron 0.6%,
    copper 0.55%, gold 0.15%, hyperite under 0.1%), with heights on a triangle that peaks in
    the middle of the band, like Minecraft's. A 3D slice of one chunk holds about 140 coal,
    190 iron, 125 copper, 30 fluxite, 19 gold and 4–5 hyperite. Before, ores were a few
    stray specks. Deep variants form wherever the host rock is deepstone, and every Surface
    biome's own stone hosts ores too. Verdant is found in mountains, three times as often.
  - Dungeons, hypermines, libraries, vaults, geodes and Ana Sheets moved down into the new
    depth range. The sky tower is centred on its origin, so it stays inside its radius.
  - Worlds saved before this (save version 1) keep their saved Surface columns only if they
    have the new height; others regenerate. On load, the player, their bed and Surface
    portals are lifted 56 blocks so they are not buried.
  - The GPU brick pool is sized for the deeper columns (about 1600 non-uniform bricks per
    Surface column, up from 760), so it does not need to regrow on the first load.
  - Generation is about 55 ms per Surface column (192 tall).

### Added
- **Night vision** in creative and spectator: **N**, or the 👁 NV touch button. Everything is
  lit like a sunny day (keeping a hint of the realm's tint); the HUD shows NIGHT VISION. It is
  saved with the player, so it survives realm trips, and switches off in survival.

- **Spectator sees through the ground**, like Minecraft's: with your eye inside solid
  blocks, faces between solid blocks are not drawn, so rays pass through rock until they reach
  open space and you see the cave walls facing you (and the terrain beyond), instead of the
  face of the block in front of your nose.

### Fixed (touch)
- A quick tap on a second touch button (say NV, then Inventory) was swallowed by the iPad
  double-tap-zoom guard. Buttons now opt out of double-tap zoom with `touch-action`.

## 0.6.0 — Phase 6: The Ember Depths, 4D portals, the Magma Regent (2026-09-30)

### Added
- **The Ember Depths**, a second realm and the Nether analogue. An enclosed world under a
  bedrock roof, with a lava sea at y 32 and one huge cavern.
  - The floor and ceiling are 3D noise over (x, z, w), with 4D pillars, stalactites and lava
    tubes.
  - Emberglass clusters light the ceiling.
  - There is no sun, sky or weather: the "sky" is each biome's haze.
  - Water boils away, beds explode, compasses spin and clocks stop.
- **Eight Ember biomes**, each with its own blocks, plants and hazards:
  - **Cinder Plains**: ember moss, emberwood trees with glowing leaves, eternal fire patches.
  - **Basalt Prisms**: hexagonal basalt columns whose heights are hashed per W layer. They
    are only whole in an axis-aligned slice; tilt the slice through W and they shatter.
  - **Sulfur Fungal Forest**: giant 4D-dome fungi, and sulfur vents that burn.
  - **Magma Sea**: a lava ocean with pumice islands and magma crust.
  - **Ash Wastes**: slow ash dunes rippling along a diagonal of (x, z, w), charred trees and
    grey haze.
  - **Soul Glass Canyons**: terraced canyons with translucent soul-glass strata, soul sand
    that slows you, and blue soul fire.
  - **Emberglass Grove**: crystal trees with 4D star canopies (spikes along ±x, ±z and ±w).
  - **Shattered Tesseracts**: floating voidstone hypercube frames with glowing vertices.
    Every slice cuts them into a different polytope.
- **4D portals.** A portal frame is a 3D hyper-frame: the face cells around a box of air in
  one of the three vertical hyperplanes. Its normal is x, z or w; that is how you walk
  through.
  - Build it from obsidian or voidstone and light it with flint and steel or a fire charge.
    The smallest frame takes 10 blocks around a 1 × 2 × 1 interior, like Minecraft.
  - Stand inside for 4 s (1 s in creative); the view swirls violet, then you travel.
  - Coordinates link at **8:1 along x, z and w** (y is not scaled). The trip back multiplies
    by 8.
  - You arrive in a known portal within 128 blocks on the Surface (16 in the Ember Depths).
    Otherwise a new obsidian portal is built on free ground nearby.
  - Portals collapse when their frame breaks. Lit portals are saved with the world.
- **Blocks and items.**
  - Rock and building: cinder and cinder bricks; voidstone and voidstone bricks (portal
    frames).
  - Light and fire: emberglass (light 15); fire and soul fire.
  - Ores and materials: ember quartz; gilded cinder (gold nuggets); hypercinder (a fuel that
    burns twice as long as coal and doubles smelting speed); Ancient Slag.
  - Ancient Slag smelts to scrap. Four scrap and four gold ingots make an ingot, and the
    ingots make the new **Ancient Slag tool tier** (harvest level 4, 2031 uses).
  - Fire charges; sulfur; the Ember Atlas.
  - Mob drops: drake scales, hound fangs, brute tusks, magma cores, wisp essence and the
    Regent Heart.
- **Ember mobs.** Each has a limb, wing, tusk or arm along its own w, so tilting the slice
  reveals it:
  - Cinder Hound packs;
  - Magma Drakes, which hover at a distance and spit fire charges;
  - Soul Wisps (passive, floating);
  - Ember Brutes, which charge;
  - Citadel Guards;
  - Slag Golems, with a third arm and leg toward +w;
  - Lava Slimes.

  Mobs spawn on cavern floors at any light.
- **Ember structures** (data-driven, on the same 4D grid; `StructureDef.realm`):
  - **Citadels**: three towers side by side along W, where the floors only connect through W
    corridors, so you climb by walking kata/ana. Treasure, barracks, guards and a hound
    spawner.
  - **Forge shrines**.
  - **Basalt ziggurats**.
  - **Magma bridges** across the lava sea, with a W branch.
  - **Ruined portals**.
  - **The Regent's Caldera**.

  Seven new loot tables.
- **The Magma Regent**, the first boss. It waits in its caldera on the Magma Sea.
  - A boss bar at the top of the screen.
  - It hovers near you and follows you through W (it drifts to your slice and steps across
    when you hide kata/ana), so it cannot be cheesed along W. Leave the arena and it returns
    and heals.
  - It throws volleys of fire charges.
  - It summons **lava pillars along W**: a line through your position, 3 blocks apart along W.
    Stepping kata/ana does not dodge them; sidestepping inside your slice does.
  - At half health it enrages: three Cinder Hounds join, attacks come faster, and a second
    line of pillars crosses your slice.
  - It drops the Regent Heart, Ancient Slag ingots, ember quartz and hypercinder.
  - R2: every pillar is announced 1.5 s ahead. Flames mark its base, the radar blinks where it
    will rise (even kata/ana), and the warning line says how many are in your slice and how
    many along W.
- Dying in the Ember Depths sends you back to your bed (or spawn) on the Surface.
- The W-Walker sells fire charges and the Ember Atlas.
- Test hooks: `?test=1&realm=ember`, `findBiome`, portal building and lighting, boss state.
  Two new e2e specs: `portal.spec` (build, light, travel 8:1, return) and `ember.spec` (R6
  views, mob line-up, biome tour, the boss fight).

### Fixed
- **Beds are two blocks long**, a foot and a head with a pillow, like Minecraft. They are
  placed and broken together, and villages, cabins and igloos generate them that way.

## 0.5.0 — Phase 5: Structures, villages, trading, beds (2026-09-29)

### Added
- **Beds and sleeping** (playtest request: "there's no way to skip the night").
  - Red, blue and white beds: craft 3 wool over 3 planks (dye wool with a poppy or a
    cornflower), or use one in a village house, cabin or igloo.
  - Right click a bed at night, or in a thunderstorm, and you sleep until sunrise. The screen
    fades out, the night passes and storms clear. A **Leave bed** button (or jump) gets you
    up first.
  - Any bed you use becomes your **respawn point**, by day too. If it is gone when you die,
    you wake at the world spawn.
  - A hostile mob within 8 blocks (in x, z and w) and 5 up or down stops you from sleeping.
    The message names it and says where it is, even when it is kata or ana of your slice
    (R2). Taking damage wakes you up.
- **Structures, all data-driven** (`src/content/structures.ts`). 32 structures generate on a
  4D grid, one attempt per spacing³ cell of (x, z, w). Each builder writes in a local frame
  and is placed in one of 48 orientations.
  - **Villages** in seven styles: meadow, orchard, marsh (on stilts), taiga, snow, savanna
    and desert.
    - Each is a plaza with a 4D well, and roads along all six horizontal directions. Roads
      follow the ground and cross water on plank bridges.
    - The buildings are houses, farms, smithies, libraries, temples, masons, fletchers and
      W-Walker shrines. Each has a 4D hip roof, sometimes a door on its ana wall, beds, a
      chest and a villager.
  - **Surface**: cabins, watchtowers, witch huts, windmills with 4D rotors, campsites,
    igloos, outposts, stone circles (a sphere of pillars), standing slabs and fossil sites.
  - **Temples and ruins**: desert temples (hyper-pyramids), jungle shrines, tesseract grove
    temples (32 hypercube edges), ruined portals, ancient ruins, and sky towers whose floors
    are joined by W-ramps.
  - **Shore and sea**: lighthouses, buried treasure, shipwrecks, and sunken monuments with a
    Drowned Sentinel spawner.
  - **Underground**:
    - dungeons with spawners;
    - hypermines: tunnels along x, z and w, with supports, webs and loot;
    - library ruins;
    - deep silent vaults, guarded by a Lurker spawner;
    - **Ana Vaults**: sealed rooms that open only onto an Ana Sheet, so the only way in is
      through W.
- **Loot tables** (30 of them, `src/content/loot.ts`): pools, rolls, weighted entries and
  pre-worn tools. They are rolled deterministically per seed and chest position.
- **Mob spawners** are block entities. They spawn their mob within 3 blocks (up to 6 nearby)
  every 10–40 s while you are within 16 blocks.
- **Villagers and trading.**
  - There are eight professions: farmer, smith, librarian, cartographer, cleric, mason,
    fletcher and W-Walker. Each has robe colours and five levels of trades, and the currency
    is **Verdant**.
  - Right click (or tap) a villager to open the trade screen.
  - Prices follow your reputation (up to 35% off when liked, up to 50% more when you have
    hit them) and demand. Offers restock twice a day.
  - Trade experience levels a villager from Novice to Master, and each level unlocks new
    offers.
  - Villagers flee monsters, go home at night and turn to face you.
  - They are **saved with the world** (the first mobs that are), in their column's data.
- **Wandering Merchant**: turns up some mornings with six random offers, and leaves after
  about a day and a half.
- **Atlases** (village, temple, vault, ruins): hold one and the readout points to the nearest
  structure it marks: a direction in your slice, the distance, and how far kata/ana. The
  search runs in a worker.
- New blocks:
  - stone bricks, thatch, plaster, dirt path, hay bale, bookshelf, lantern, fence, campfire;
  - sea bricks and sea lantern, tesseract bricks, gilded bricks;
  - red and blue wool, the mob spawner, beds.
- The hypercompass points to your bed once you have one.
- F3 shows the villager and spawner counts and your bed.
- A new e2e spec, `tests/e2e/structures.spec.ts`:
  - finds a village through the structure grid and checks its roads and villagers;
  - takes the R6 views of the village;
  - trades through the trade screen;
  - sleeps through a night, including the refusal while a monster waits kata;
  - respawns at the bed;
  - reads the atlas;
  - checks a dungeon's spawner and loot chests, and that the spawner spawns.

### Changed
- `docs/how-to/add-a-structure.md` is now a real how-to, and `docs/data-formats.md` documents
  structures, loot tables, trades and professions.

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
