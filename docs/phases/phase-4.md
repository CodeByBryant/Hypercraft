# Phase 4 report: Mobs, combat, health

Status: **complete**. Typecheck, 107 unit tests and the full e2e suite are green: smoke, R6
views, worlds/touch, survival items, and the new mobs spec.

## R6 reference views

The standard terrain views are in `docs/screenshots/phase-4/1-axis-aligned.png`,
`2-xw-30.png` and `3-xw45-zw45.png`; the slice maths is unchanged. The new mob views
(`mobs-*.png`) show eight mobs lined up in front of the player, frozen for the shot:

| mob | position |
| --- | -------- |
| Hyperchicken | 3.5 m ahead |
| Kata Sheep | 4.5 m ahead |
| Kata Slime | 5.5 m ahead |
| Ana Cow | 6 m ahead |
| Shambler | 7 m ahead |
| Phase Creeper | 8 m ahead |
| Web Weaver | 9 m ahead |
| Bone Archer | 9.5 m ahead |

1. **Axis-aligned** (`mobs-1-axis-aligned.png`). Each mob is spawned facing you, with its
   own w axis on your hidden axis, so you see its own 3D section, which looks like a
   Minecraft mob. Quadrupeds show the four legs in their w = 0 plane; their ±w legs are out
   of the slice.
2. **XW 30°** (`mobs-2-xw-30.png`). The mobs keep world-aligned frames, so the tilted
   slice cuts them obliquely. Bodies stretch into prisms, and the thin legs mostly slip out
   of the slice: the sheep floats and the chicken keeps stubs. The slime's hypersphere is
   still a sphere, as it must be.
3. **XW 45° + ZW 45°** (`mobs-3-xw45-zw45.png`). Strongly oblique cuts. A different subset of
   legs crosses the slice (the sheep shows two, the chicken one), the cow is a low sliver,
   and the shambler is cut through its torso.

The R2 pair shows the proximity warning:
* `threat-stalker-ana.png`: an Ana Stalker 5 m ana of you is invisible. The right edge
  pulses violet, the radar shows a red dot above the centre line, and the top line reads
  "⚠ Ana Stalker · 6 m away, 5 m ana".
* `threat-stalker-in-slice.png`: the same stalker stepped into your slice. It is visible,
  with magenta eyes, and the warning is gone.

`death-screen.png` shows the death screen after the explosion test. You can see the 4D
crater, the smoke, the empty hearts and the spilled hotbar.

## What works

### Mobs as exact 4D shapes

* Each mob is a union of analytic 4D **boxes**, **balls** and **capsules** in its own
  orthonormal 4D frame: world up plus a horizontal (R, F, H) basis. A mob can face any 4D
  direction.
* Each frame, the mobs whose bounding 4-ball crosses the view hyperplane (up to 48) are
  packed into an RGBA32F texture: 6 texels per mob and 4 per part.
* The ray marcher intersects them per pixel in the same pass as the terrain:
  * one bounding-ball test per mob;
  * then exact slab and quadratic tests in the mob's local frame;
  * a single `entityTrace` per ray.
* Terrain and mobs occlude each other correctly.
* Mobs are lit by the block and sky light of their cell. They flash red when hurt, and the
  Phase Creeper's fuse makes its body pulse through its own w axis, so its cross-section
  flickers.
* Picking (for attacks) uses the same primitives on the CPU, with rays in the slice.

### 28 Surface mobs, all data

Every mob is defined in `src/content/mobs.ts` (see the how-to). They cover the spec's
Surface and Caves list:

| group | mobs |
| ----- | ---- |
| passive | Kata Sheep, Ana Cow, Hyperchicken (lays eggs), Tesseract Rabbit, Bog Frog, Frost Fox, Dune Camel, Hyperhorse, Glass Moth (seeks light), Reef Squid, Lantern Fish, Kata Slime (bounces, splits), Hyperbat |
| surface hostiles | Shambler (burns by day), Bone Archer (arrows), Ana Stalker, Phase Creeper, Web Weaver (climbs, spins webs), Hollow Husk, Frostbite Wraith, Marsh Leech, Drowned Sentinel |
| cave hostiles | Slime Horde, Lava Slime, Phase Golem (only hurt while its cross-section is in your slice), Crystal Crawler, Lurker (blind, hunts noise), Ore Mimic (an ore until you come close) |

Legs follow the 4D rule: a stance needs a 3D footprint in (x, z, w).
* Quadrupeds have six legs: four in their w = 0 plane and two toward ±w.
* Humanoids and birds stand on a tripod.
* Spiders have four diagonal legs plus four reaching into ±w.

### 4D AI

* **Pathfinding.** 4D A* over the voxel grid: 6 horizontal directions (±x, ±z, ±w), step up
  one block, drop up to three. It returns a partial path when the goal is out of reach, and
  its budget is 2 searches per frame, 700 nodes each. A unit test shows a mob routing around
  a wall that spans all of x/z by stepping along W.
* **Behaviours.** Twelve behaviour profiles, from grazing and fleeing to kiting archers,
  fuse-lighting creepers, and the stalker, which approaches along **your** hidden axis and
  keeps its thin axis aligned with it.
* **Spawning.** Every half second the spawner tries random points on a 4D shell 14–44 blocks
  around you, so mobs appear kata and ana of you as well as in the slice. It uses the biome
  tables: day and night from the light level, water, and dark caves (with cave-biome
  tables). Caps are 14 hostile and 12 passive mobs, hostiles despawn beyond 80 blocks, and
  peaceful difficulty removes them.

### Combat

* **Damage per swing.** Damage depends on the tool kind and tier: fist 1, iron sword 6,
  hyperite sword 7, axes more, pickaxes less.
* **Cooldown and crits.** A Minecraft-1.9-style swing cooldown makes spam-clicking weak. A
  full-strength swing while falling is a critical hit (×1.5, sparks). Holding the button keeps
  swinging at full strength, which is good for touch.
* **Knockback** follows your forward direction, so it stays inside the slice.
* **Wear.** Swords lose 1 durability per hit and other tools 2.
* **Bow.** Hold right click to draw (1 s for full power: 9 damage). Arrows use ammunition,
  fly with gravity, stick in blocks, and can be picked up again. Bone Archers shoot the same
  arrows.
* **Explosions.** The block damage is a 4D ball (bedrock and very hard blocks survive), and
  30% of the broken blocks drop. Blast damage falls off over twice the radius and knocks
  back. Smoke and spark particles fly inside the slice.

### Health, air, death

* **Hearts and air.** 10 hearts, with 1 health every 2 s after 4 s without damage, and
  0.5 s of invulnerability after a hit. There are 15 s of air underwater, then drowning.
* **Damage sources:**
  * falls (1 per block beyond 3; water, ladders and cobwebs cancel it);
  * lava, and damaging blocks such as cactus and magma;
  * the void;
  * mobs, arrows and explosions.
* **Difficulty** scales mob damage: easy ×0.5, hard ×1.5.
* **Hit direction.** The damage flash is red, and a red gradient on the left or right edge
  shows whether the hit came from kata or ana.
* **Death.** The inventory spills where you fell, and a death screen offers **Respawn** at
  world spawn (in hardcore, **Spectate world**) or save and quit. Health and air are saved in
  the world.

### R2 fairness: hostiles out of your slice are always announced

* **Screen edge.** A violet "heartbeat" pulse on the kata (left) or ana (right) edge, for
  any hostile within 16 blocks that is mostly outside your slice. It is stronger when the mob
  is closer, and distinct from the orange lava warning.
* **Radar.** Mobs are dots on the hidden-axis radar: red hostile, green passive.
* **Warning line.** A line at the top names the nearest hidden hostile and says how far
  kata or ana it is.
* **Cobwebs.** Web Weavers put cobwebs between themselves and you, so the webs often land
  kata or ana of your slice. Cobwebs show on the radar in pale violet and slow you to 15%.

### Misc

* Effect particles: bursts of 4-balls launched inside the slice for hits, crits, mob deaths
  and explosions.
* Mining, sprinting, fights and explosions make **noise**. Lurkers follow it.
* **F3** adds mob counts, how many mobs are in the slice, arrows, health and air, and the
  targeted mob.
* Fixed an old bug: while paused, dead or inside a screen, the last movement keys no longer
  keep the player walking.

## Verification

* `npm run typecheck`: clean.
* `npm test`: **107 unit tests** in 13 files. New tests:
  * mob registry: parts bounded and covered by the radius, drops resolved, spawn tables;
  * GPU packing: offsets relative to the window origin, part records, culling off-slice;
  * ray picking: nearest mob, rotated frame, misses;
  * the stalker frame: its thin axis follows the given hidden axis, and the frame is
    orthonormal;
  * the Phase Golem is only hurt in-slice;
  * knockback and hurt invulnerability;
  * drops on death, and slime splitting;
  * mob physics: falls and rests on the ground;
  * Web Weavers spin cobwebs along W;
  * combat numbers;
  * vitals: damage, i-frames, death, regeneration, drowning, fall-damage table,
    save/load clamps;
  * cobweb physics.
* e2e `tests/e2e/mobs.spec.ts` on SwiftShader:
  * all eight mobs cross the slice in each R6 view;
  * rendering cost: 1.6–1.9 s per 270p frame on software GL, and the same views without the
    mobs differ by −1% to +12%, which is within SwiftShader's noise
    (`docs/screenshots/phase-4/mobs.json`). Each pixel does at most 48 bounding-ball tests,
    and exact tests only for mobs its ray touches. R5 still needs confirming on real GPUs
    (`?bench=1`);
  * an iron sword kills a sheep in 2 hits, with wool dropped and 2 points of wear;
  * a stalker 5 m ana is invisible, the ana edge glows (> 0.3) and it is named; stepping
    into the slice makes it visible and clears the warning;
  * a full bow draw fires one arrow and uses one arrow;
  * an explosion clears the centre block and damages the player;
  * a lethal hit spills the inventory and shows the death screen; Respawn restores 20 health.

## What's broken / limited

See `KNOWN_ISSUES.md` ("Mobs and combat"). The main points:
* mobs are not saved;
* no audio yet;
* collision uses axis-aligned hitboxes (rendering and picking are exact);
* explosions ignore exposure;
* no riding, breeding, armour or hunger yet (Phases 7 and 10).

## What's next (Phase 5)

Structures v1 (the biomes already name theirs), loot tables, villages with trading NPCs, and
dungeons with mob spawners, using the Phase 4 mobs.
