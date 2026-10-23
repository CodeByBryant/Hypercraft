# Phase 9 report: the Mirror Realm, the Crystal Abyss, the Cloud Archipelago

Status: **in progress** (this file grows with each step).

## 9.1 Third person, the player's body, a hand and a paper doll

Asked for alongside Phase 9, and done first so the rest of the phase can be seen on a body.

* **F5** (or 📷 on touch) cycles first person, third person from behind and third person from the
  front. The camera sits 4 blocks away along your 4D view direction and is pulled in by blocks
  (`Game.updateView`). Only the *view* moves: targeting, mining and attacks still start at your
  real eye, so the crosshair behaves as in Minecraft's third person.
* **The body** (`src/game/PlayerModel.ts`) is a humanoid made of the same analytic parts as the mobs
  (boxes and a capsule, at most 16), appended to the mob buffer by the packer
  (`MobManager.extraBody`). It wears the colours of your armour (taken from the armour items' icons),
  folds Phase Wings on its back and spreads them when you glide (prone along the heading), holds the
  item in the right hand, swings the arm when you attack, mine or place, walks with the legs
  against the arms, lowers when you sneak and raises a shield or a drawn bow.
* **The body frame is your camera frame without pitch**, so it turns with you and with the slice:
  rotate the slice through W and you stay a clean figure. (Mobs, with a fixed frame, are cut
  obliquely; you are not a mob.)
* **First person** has a *paper doll* hand (`src/ui/BodyViews.ts`): a flat sleeved arm holding the
  item's icon, bobbing with your stride, swinging, rising when you switch items, coming to the mouth
  when you eat, up in front of you when a shield blocks, pulled back to draw a bow. A small *paper
  doll* of yourself (the same part list drawn as rectangles, front on) sits in the top-left corner and
  shows armour, wings, sneaking and the swing. Both are settings (Settings: show hand, show paper
  doll); the hand is hidden on touch screens, where the buttons live.
* Tests: `tests/unit/playermodel.test.ts` (part budget, bounding radius, armour, swing, glide, sneak)
  and `tests/e2e/body.spec.ts` (hand, doll, third person, front view with a tilted slice).

Screenshots: `docs/screenshots/phase-9/body-1-first-person.png`, `body-2-third-person.png`,
`body-3-third-person-front-tilted.png`.

## 9.2 The Mirror Realm

A reflected copy of the Surface (Realm D).

* **A relabelling, honestly.** The spec's "gravity points along -W, and Y becomes horizontal" cannot
  be more than names in a world with no preferred axis, and the engine is built on one (columns,
  heightmaps, light, fluids and mob physics all assume up is the axis it calls Y). So the realm keeps
  that axis as up, *calls it W*, and calls its hidden axis Y (`RealmDef.axisLabels`): the hidden-axis
  panel, the compass line, the slicer compass and F3 all use the realm's names. Left and right swap
  (`mirrorControls`: strafing, turning, tilting through the right axis; a setting turns it off).
  The sky is inverted (`invertedSky`): the day is as bright as ever, but the sun crosses below the
  horizon (it lights the undersides of things), the moon hangs overhead and the stars shine by day.
* **The terrain is the Surface, reflected** (`src/world/gen/MirrorGen.ts`): each column is the Surface
  column across the mirror x -> -x - 1 from a Surface generator with the same seed and no
  structures, flipped along x and repainted. Heights, rivers, lakes, caves and ores are the
  Surface's own, so landmarks correspond; a unit test checks air and rock cell by cell. Seven Mirror
  biomes (`src/content/mirror.ts`: silver plains, glass forest, quicksilver fen, shard dunes, frost
  mirror, echo peaks, chrome sea) each reflect a group of Surface biomes (`mirrorBiomeFor`) and bring
  four ground blocks and two plants of their own; plants on solid ground become the biome's plants.
  The textures needed a bigger atlas: block texture ids are now 11 bits (2048 textures, 32 columns).
* **The way in: Silver Arches.** A small ruin stands on dry Surface land (`silver_arch`, spacing 256).
  Its rift sleeps until a **Hand Mirror** (silver ingot + Mirror Glass + a starlight shard, so after
  the Void) wakes it; held, the Hand Mirror points to the nearest arch like an atlas. Stepping into
  an awake rift (1.5 s) crosses to *your mirror image*, mirrored in x (`scalePosition`), standing
  beside a rift of an arch that is built there if none stands (`Game.arriveAtRift`). The rift in that
  arch leads home. (Mirror Glass, which Phase 7 called "the portal frame", is now the arch's
  corner lamps and the Hand Mirror's glass.)
* Mirrorite: a new ore in the Mirror Realm's rock (`mirrorite_ore` -> mirror shards -> mirrorite
  ingots), for the realm's armour (9.3).
* Tests: `tests/unit/mirror.test.ts` (realm flags, biome mapping, the reflection itself, the arch, the
  recipe), `tests/e2e/mirror.spec.ts` (labels, sun below, the palette; wake a rift, cross, come home).

## 9.3 Mirror mobs, the Mirror Palace, the Mirror Twin, Mirror armour

* **Mobs** (`src/content/mirrorMobs.ts`, night tables in `MIRROR_SPAWNS`):
  * *Reflection Shambler*: walks on its hands with its legs in the air; arrows you shoot at it come
    back at you (`reflects`, handled in `Projectiles`).
  * *Mirror Stalker* (AI `mirror`): keeps to **your reflection** in a pane of glass that stands
    between you and it and creeps toward you (0.9 m/s). Step left and it steps left; walk at the
    glass and it comes twice as fast. Back away faster than the glass advances, or let it reach you
    and fight.
  * *Silver Wraith*: quick, flying, undead (silver and Smite hurt it double); its touch weakens you.
* **Mirror Palace** (`mirror_palace` structure, Mirror land biomes only): a silver hall with a dais, a
  **Mirror Altar** in the middle, four chests of palace loot (mirror armour, reflection dust, Hand
  Mirrors, mirrorite) and two Shambler spawners.
* **The Mirror Twin** (`src/game/MirrorBoss.ts`, AI `twin`): hold a Hand Mirror up to the altar.
  * It stands where you would stand if the dais were a mirror: the **point reflection of you through
    the altar**. Walk toward the middle and it does too, so the two of you meet at the altar.
  * Its body is rebuilt every frame from *your* pose and colours, in silver (`Mob.dyn`, the player
    model's `dollParts` with a palette): your armour, your held item, your walk.
  * It **copies what you do a moment late** (0.7 s, 0.5 s in phase II, 0.3 s in phase III): a swing
    hurts you if you are in reach of it when the copy lands, a shot comes back at you, a raised
    shield means it raises one too (it takes a quarter damage while shielded: don't block).
  * Phase II (below 66%): two Mirror Stalkers step out. Phase III (below 33%): faster copies and
    **mirror beams** along W, announced on the hidden-axis radar first (same machinery as the
    Sovereign's lances, now the shared `LanceField` in `src/game/Lances.ts`).
  * While it lives nothing within 28 blocks of the altar can be broken or placed; leave the arena and
    it goes home and heals. A defeat is remembered (`SavedState.data.bossFights.mirror`) and drops a
    **Twin Core**, mirror shards, silver and golden apples.
* **Mirror armour** (mirrorite): a full set sends a third of a melee hit back at whatever struck you.
* **`BossFight`** (`src/game/BossFight.ts`) is the interface every realm boss now runs behind; `Game`
  keeps a list (`fights`) so the Resonance Titan and the Storm Sovereign slot in the same way. The
  Void Sovereign was moved onto it (and onto `LanceField`) without changing its behaviour.
* Advancements: Face Your Reflection, Mirror Mirror (the Twin), Not My Problem (reflect a blow with a
  full set), Copycat, Upside Down, Silver Lining Again.
* Tests: `tests/unit/mirrormobs.test.ts`, `tests/unit/mirrorboss.test.ts` (reflection steering, the
  delayed copies, shield, phases, beams, arena rules, save), the palace in `mirror.test.ts`, and an
  e2e that wakes the Twin with a Hand Mirror and fells it (`mirror.spec.ts`).

## 9.4 The Crystal Abyss and the Prism tier

* **The realm** (`abyss` in `realms.ts`): an enclosed geode world, 128 tall, bedrock top and bottom,
  no day, almost no ambient light (0.02): the only light is what grows in it, so torches, lanterns
  and the luminous biomes decide where you can see. A dark water line at y 24 is its sea.
  `cavernSpawns` puts mobs on any cavern floor (the existing Crystal Crawler lives here until 9.5).
* **The generator** (`src/world/gen/AbyssGen.ts`, ~45 ms per column in Node for neighbouring
  columns): a 4D density lattice every 4 blocks along x, y, z and w (big chambers where a slow noise
  is high, tunnels where two noises are both near zero, so they are curves in a slice), interpolated
  to every cell; the same lattice answers `sample()`, `surfaces()` and `spawnPoint()`. Biomes are
  picked per (x, z, w) column from two slow noises, and the Echo Lakes wherever the floor is under
  the water line.
* **Shifting crystal walls**: inside a wall mask, thin slabs of translucent crystal cut the caverns
  along planes whose normals lean into W. In 4D that is all "shifting" has to mean: step kata or
  ana and the wall slides sideways past you (a unit test walks a wall along W and watches its x
  change). `wallAt()` is public, and the spawn point checks it.
* **Hyper-geodes**: hollow 4-balls (radius 8 to 14) on a 64-block lattice: a husk, a calcite layer, a
  glowing lining with prism ore in it, resonance clusters budding inside and prism crystal at the
  heart. In a slice the hollow breathes as you move along W, like the cross-section of a ball.
  Geodes (and walls) are features, like trees: they do not move the floor `sample()` reports.
* **Six biomes** (`src/content/abyss.ts`, four ground blocks and two plants each): Prism Forest
  (violet moss and tall prism-glass pillars), Geode Hollows (calcite and agate), Resonance Caverns
  (humming stone, resonance clusters), Lumen Grotto (glowcap soil, spore light), Shard Barrens (dark
  rubble, no light at all) and the Echo Lakes (the water, kelp and coral).
* **The way in: the Geode Gate.** A hollow geode 18 to 44 blocks under the Surface (`geode_gate`,
  one per ~224 blocks under any biome above ground) with a dormant Abyss rift on a plinth of gate
  stone, resonance clusters around it and a chest holding Resonance Crystals and torches. Hold a
  **Resonance Crystal** up to the rift: it is used up and the rift wakes. Stepping in leads to the
  Abyss at the same x, z, w (the Abyss is not scaled), at about the depth you came from, in a gate of
  your own in a chamber carved for it; that gate leads home. Resonance Crystals grow in the Abyss's
  geodes and resonance caverns, and on the Surface in the crystal geode caves (`sky_crystal_cluster`
  now drops them).
* **`src/content/rifts.ts`** is the table behind both rift links (Mirror and Abyss): awake and
  dormant blocks, the realms, the waker item, the arch cells, and whether an arrival stands on the
  ground or in a carved chamber (`stand`). `Game.updateRift`, `arriveAtRift` and the wake items read
  it, so a new rift link is a row there plus its blocks.
* **Resonance Compass**: a Slicer Compass tuned with three Resonance Crystals; held, its arrow points
  to the nearest Geode Gate (an atlas readout like the Hand Mirror's).
* **The Prism tier** (`tiers.ts`): Prism Shards come from prism ore (iron level 3, glowing in the
  ceilings and the geode linings), smelt to Prism Ingots and make tools and weapons (level 4, speed
  10.5, durability 2800, damage 5.5, enchantability 24). Prism armour comes with the Abyss mobs (9.5).
* Advancements: Resonance, Tuned In, Wake the Gate, Into the Abyss, Prismatic, Light Through Glass,
  Cut Like Light, Crystal Clear.
* Tests: `tests/unit/abyss.test.ts` (realm flags, biomes, determinism, bedrock and water, every
  biome reached, `sample` against blocks, the spawn, crystals, geodes, shifting walls, the gate, rift
  links, the Prism tier), `tests/e2e/abyss.spec.ts` (the three R6 views, the dark, a biome tour, a
  full gate trip: wake with a crystal, cross down, arrive in a carved chamber, come home).

## 9.5 Abyss mobs, the Crystal Cathedral, the Resonance Titan, Prism armour

* **Mobs** (`src/content/abyssMobs.ts`, per-biome tables in `ABYSS_SPAWNS`):
  * *Prism Spider* (AI `prism`): climbs, skitters 6 to 11 blocks off and shoots **light beams**: arrow-like
    projectiles flagged `beam` (`MobDef.projectile.beam`, `Projectiles`).
  * *Resonance Golem* (AI `resonant`): sings a **sound pulse** every four to six seconds.
  * *Geode Slime* (`hopper`, `hardens`): its shell hardens for 1.3 s after every hit (a quarter damage, a
    grey tint); it splits when it dies.
* **Sound pulses** (`src/game/mobs/Pulses.ts`): an expanding 4-sphere of one of four **tones** (Low, Mid,
  High, Shrill). In your slice it is a sphere growing around its source, drawn as a ring of glowing points
  (`pulseFx`, the `ping` particle). It hurts once as it passes you, unless stone stands between you and its
  source (cover is a line of sight in 4D), and it can be **cancelled** by ringing a **Tuning Fork** of the
  same tone while it is still on its way. Pulses reach you through the hidden axis like anything else.
* **Tuning Forks** (`low_fork`, `mid_fork`, `high_fork`, `shrill_fork`): two resonance crystals, a prism
  ingot and a tuning metal (iron, gold, hyperite, amethyst). Ring one anywhere to sound its tone
  (`Game.ringFork`, a 0.35 s cooldown, your own ring is drawn too); ring one at the Resonance Bell to wake
  the Titan.
* **Prism armour** (`armor.ts`, set `prism`): a full set **reflects light beams** (they turn around and
  fly back at where they came from, 1.25x) and keeps **night vision** on you (`Game.prismGear`). The
  Cathedral's chests hold it.
* **Crystal Cathedral** (`crystal_cathedral`, Abyss land biomes, one per ~224 blocks): a nave 37 long, 19
  wide and 15 high cut out of whatever stands there, prism-glass pillars, crystal windows, a doorway at the
  west end, a dais at the east end with the **Resonance Bell**, four chests (Prism armour, forks, shards,
  crystals) and three spawners. The Resonance Compass now points to Geode Gates on the Surface and
  Cathedrals in the Abyss.
* **The Resonance Titan** (`src/game/ResonanceBoss.ts`, AI `titan`):
  * Four **crystal plates**, one per tone, soak nine tenths of every blow (`Mob.guard`); each shattered plate
    gives 15% back.
  * It **sings** a tone (a pulse, shown on the HUD: "The Titan sings SHRILL · ring the matching fork!").
    Answer in time with the matching fork and the pulse is cancelled and the plate cracks (two cracks to
    shatter it in phase I, three later). Ring the wrong fork and you take 3 and are told what it sang; do
    nothing and the shell hits you for 9.
  * All four plates gone: the **heart is exposed** for 14 s (no calls, no armour), then they re-form.
  * Phase II (66%): calls in pairs, faster, two Geode Slimes. Phase III (33%): three voices at once and
    crystal spikes that stab up along W, announced on the radar (the shared `LanceField`).
  * Nothing within 30 blocks of the Bell can be broken or built while it lives; it goes home and heals if
    you leave; its body (`titanParts`) is rebuilt every frame from its plates. A defeat is remembered
    (`SavedState.data.bossFights.abyss`).
* Advancements: Light Show, Noise Complaint, Rock and a Hard Place, Faceted, Returned to Sender, Perfect Pitch,
  Call and Response, For Whom the Bell Tolls, Resonance Cascade.
* Tests: `tests/unit/abyssmobs.test.ts` (definitions, beams, golem songs, pulses: growth, once-only hits,
  cover, cancel, 4D reach; slime hardening; the Prism set), `tests/unit/resonance.test.ts` (the Cathedral
  and Bell, waking, armour, plates, calls, answers, off-key, exposure, phases, arena, save), and e2e
  (`abyss.spec.ts`: a pulse ring you see and answer, Prism armour turning a beam, a fork rung at the Bell,
  the Titan's call answered and its fall).

## 9.6 The Cloud Archipelago, wind along W, Wind Gliders

* **The realm** (`cloud` in `realms.ts`): an open sky with a day, floating islands over a sea of cloud, **gravity
  13 (40% of the Surface)**: you jump about three blocks and fall slowly (fall damage scales with gravity, and
  mobs now fall at the realm's gravity too), and **wind currents** along W (`RealmDef.wind`, 12 blocks per
  second at most). No bedrock: dig through the cloud and you fall out of the world.
* **The generator** (`src/world/gen/CloudGen.ts`, ~6 ms per column in Node):
  * The **cloud sea**: a walkable, diggable floor of cloud eight blocks thick whose top rolls between y 24 and
    36 with a slow 3D noise over (x, z, w). Its biome is the Nimbus Sea.
  * **Islands**: one per 88-block cell of a 4D lattice (x, z *and* w), 85% of cells, jittered; a ball in the
    three horizontal axes (radius 26 to 46) with a domed top and a conical underside, 54 to 104 up. In a slice
    you see a disc that grows and shrinks as you walk kata and ana (a unit test measures it). Islands overlap.
  * **Biomes**, one per island from noise at its centre and its altitude: Cirrus Meadow, Storm Reef, Sunbreak
    Gardens, Zephyr Terraces and (only on the highest islands) the Aurora Ridge. Each brings four ground blocks
    and two plants of its own (`src/content/cloud.ts`).
  * `sample()` answers the highest floor (island top or cloud sea); the spawn is a calm meadow, well inside its island.
* **Wind** (`src/physics/wind.ts`): layers about 24 blocks thick stacked in y, each blowing toward +W (ana, when
  your slice is aligned) or -W (kata), the next the other way. The layers bend with x and z and drift up and down
  with the clock, so a current you rode a minute ago may carry you the other way now: find the altitude you want.
  `Player.drift` carries you along W as its own collision-respecting move (it is not your input, so "no kata/ana
  input" does not cancel it), easing in and out. How much carries you: 10% standing, 50% falling, 60% gliding
  with ordinary wings, 100% with a Wind Glider. The HUD's hidden-axis panel shows `wind +W 8`.
* **Wind Glider** (`wind_glider`): chest-slot wings like Phase Wings (fall, press jump; look to steer, rotate your
  slice to bank through W) that **ride the current at full strength**: gliding in a strong current adds its
  full speed (up to 12 m/s) to your own glide, the fastest way across the Archipelago. Craftable from cloud
  cotton (picked from cirrus cotton), a feather and string; repaired with cloud cotton.
* **The way in: the Sky Gate**, a small ruin on a Surface peak (Hollow Peaks, Frost Spires, Stony Peaks, Volcanic
  Highlands) with a dormant Cloud rift. A **Zephyr Feather** (three feathers and a resonance crystal) held up to
  it wakes it. The rift leads to the same x, z, w in the Cloud Archipelago, in a gate of your own on top of
  whatever lies there, and back (`rifts.ts` has its row; `stand: 'ground'` in both realms).
* Advancements: Feather Light, Wake the Sky Gate, Head in the Clouds, Cotton Picking, Wind Rider, Jet Stream.
* Tests: `tests/unit/cloud.test.ts` (realm flags, determinism, the cloud sea, islands and their blocks, every
  biome reached, `sample`, the spawn, islands as 4D balls, the wind field, Player drift and walls, light gravity,
  the glider, the Sky Gate), `tests/e2e/cloud.spec.ts` (the three R6 views, a biome tour, a full gate trip, a
  three-block jump, a glider carried along W by the current).

## 9.7 Cloud mobs, the Cloud Citadel, the Storm Sovereign, Cloud armour

* **Mobs** (`src/content/cloudMobs.ts`; all exclusive to the realm, none of them walks):
  * **Storm Kite** (16 hp): a canvas diamond that hangs about nine blocks off and spits bolts of static.
  * **Thunder Hawk** (26 hp, AI `diver`): circles five blocks above you, then folds its wings and dives; the
    dive aims at your feet so it lands even under the realm's light gravity.
  * **Wind Sprite** (10 hp, AI `sprite`): a knot of gust that shoves you along W every few seconds.
  * **Cloud Whale** (120 hp, passive): a giant that drifts over the islands. Riding it comes with mounts (Phase 10).
  * Mob gravity now follows the realm (`28 * realm.gravity / 32`), so nothing falls like a stone in the sky.
* **Cloud armour** (`armor.ts`, set `cloud`, 2/6/5/2 points, made of **cloud silk** woven from cloud cotton): the
  full set gives **slow falling and wings** (`wings()` accepts it like a Wind Glider, `slowFall` like the potion).
  The Citadel's chests hold finished pieces, damaged, and Wind Gliders.
* **The Cloud Citadel** (`src/world/gen/structures/builders/cloud.ts`, realm `cloud`, one per ~200 blocks, half of
  the cells): on a land island, a curtain wall with four gates, four towers, a keep and, on the keep's roof, the
  **Storm Beacon** (`storm_beacon`, unbreakable). East of it a ramp climbs to the roof; four chests
  (`cloud_citadel` loot: cloud armour, a Wind Glider, cotton and silk, storm feathers, gale dust, prism ingots, golden apples, XP bottles, enchanted books) and spawners for Wind Sprites and Storm
  Kites guard the way.
* **Waking it**: a **Storm Horn** (two storm feathers, two gale dust and a prism ingot) sounded at the Beacon.
  Once: a defeated world never sees it again (saved under `bossFights.cloud`).
* **The Storm Sovereign** (`src/game/StormBoss.ts`, 650 hp, AI `tempest`: it circles about twelve blocks off and
  five above you, and goes home to heal if you are more than forty blocks away). It runs on the generic
  `BossFight` interface and the shared `LanceField`, like the Mirror Twin and the Resonance Titan:
  * **Lightning**: bolts are announced on the ground (sparks, and the radar), then strike a moment later as a
    column of lightning and burn for a second. One in phase I, two in phase II, a line of them across your slice
    in phase III.
  * **Gales**: every 13 / 10 / 8 s (by phase) it calls a gale along W: a warning, then two and a half seconds of a
    hard shove kata or ana (14 m/s, 70% of it; **crouch to grip the cloud** and a quarter of it remains).
    `Game.updateWind` lets the gale override the realm's currents.
  * **Phase II** (below 66%): two Thunder Hawks and two Wind Sprites join. **Phase III** (below 33%): it charges for
    four seconds at a time, taking a quarter of the damage (`shielded`), while bolts fall faster.
  * **Anti-cheese**: nothing within 30 blocks of the Beacon can be broken or placed while it lives.
  * Drops: a **Storm Heart**, storm feathers and 10 000 XP.
* **The Rift Compass** (`rifts.ts`; asked for because the rifts were nearly impossible to find): a compass, an
  amethyst shard and a gold ingot make a held atlas that points at the nearest **Silver Arch, Geode Gate or Sky
  Gate** (the Surface ends of the three links), or at the Crystal Cathedral and the Cloud Citadel from inside
  those realms. The older locators (Hand Mirror, Resonance Compass) sat behind endgame materials and the Sky Gate
  had none. It also turns up in library chests.
* **Touch fix** (`style.css`): touch layouts had hidden the first-person hand outright and parked the paper doll
  under the radar, so on a phone or tablet neither showed. The hand is now drawn smaller and nearer the middle
  (clear of the right thumb's buttons) and the doll sits below the radar. The desktop layout is unchanged.
* Advancements: Fly a Kite, Thunderstruck, Wind Sprite Wrangler, Woven Weather, Light as Air, Sound the Storm,
  The Beacon Answers, Clear Skies.
* Tests: `tests/unit/cloudmobs.test.ts` (mob bodies and drops, spawn tables, the Cloud set), `tests/unit/stormboss.test.ts`
  (waking and its refusals, bolts announced and striking, gales, the sneak grip, phases and minions, the charge, the
  arena veto, defeat, save and load), `tests/unit/rifts.test.ts` (the compass), and e2e (`cloud.spec.ts`: a lineup
  of the realm's mobs, then the horn, an announced bolt, a gale that carries you along W, and the Sovereign's fall).
