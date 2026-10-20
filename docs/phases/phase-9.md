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
