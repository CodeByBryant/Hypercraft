# Phase 6 report: The Ember Depths, 4D portals, the Magma Regent

Status: **complete**. Typecheck and 136 unit tests are green, and so is the full e2e suite:
all 10 tests (smoke, R6 views, worlds ×2, items, mobs, touch, structures, and the new portal
and Ember specs) in 6.8 min.

Playtest fix first: **beds are two blocks long** (a foot and a head with a pillow), placed
and broken together.

## R6 reference views

The standard terrain views are in `docs/screenshots/phase-6/1-axis-aligned.png`,
`2-xw-30.png` and `3-xw45-zw45.png`. The Phase 6 views:

* **The Ember Depths from spawn** (`ember-1-axis-aligned.png`, `ember-2-xw-30.png`,
  `ember-3-xw45-zw45.png`). Sulfur fungi (4D dome caps), emberglass crystal trees and cinder
  under the red haze. Tilting through W turns the fungi's dome caps into slabs, and brings
  other trees' spikes into the slice.
* **A lit portal** on the Surface (`portal-*.png`). The obsidian hyper-frame and its purple
  membrane: a 2 × 3 × 2 box in the (y, z, w) hyperplane, normal along x. Aligned, it looks
  like a Nether portal. Tilted, the slice cuts the membrane box and the frame obliquely,
  because the portal is 3D and extends along W. The camera sits on a line through the portal
  centre, so the portal stays in every slice.
* **The arrival portal** in the Ember Depths (`ember-arrival-*.png`), built automatically at
  1/8 of the x, z and w coordinates.
* **The Ember mobs**, lined up and frozen (`ember-mobs-*.png`): hound, wisp, lava slime,
  brute, guard, drake and golem. All 7 cross the aligned slice. Tilted by 30°, 6 of them do
  (the drake's ana wing slips in); tilted twice, only 1.
* **The Magma Regent** in its caldera (`regent-*.png`). The fight: `regent-telegraph.png`
  shows the boss bar, the R2 warning ("1 in your slice, 5 kata/ana along W") and a line of
  blinking pillar marks along the radar's ana axis. `regent-pillars.png` is the eruption, and
  `regent-enraged.png` phase 2.
* **The biome tour**: `biome-*.png`, one shot per Ember biome.

## What works

### The realm

* **Shape.** 128 blocks tall. Bedrock floor and roof, a lava sea at y 32, and one cavern
  between a floor surface and a ceiling surface.
* **Terrain.** Both surfaces are 3D noise over (x, z, w), plus 4D pillars, stalactites and
  lava tubes from a 4D noise lattice. Ore blobs (4D balls) hold ember quartz, gilded cinder,
  hypercinder and Ancient Slag.
* **Light and sky.** Emberglass clusters under the ceiling light the realm, with an ambient
  red tint. There is no sun, moon, stars, clouds or weather: rays that escape end in the
  biome's haze.
* **Rules.** Water boils away, beds explode, compasses spin and clocks stop.
* **Mobs** spawn on any cavern floor above the lava, whatever the light.
* **Cost.** About 42 ms per column in Node (the Surface is about 63 ms there).

### Eight biomes

Each biome has 3+ unique blocks and 2+ unique plants (the registry test enforces this), and
its own hazards:

| biome | floor | features | hazards |
| ----- | ----- | -------- | ------- |
| Cinder Plains | gentle hills of ember moss | emberwood trees (glowing leaves), fire blossoms | eternal fire, lava lakes |
| Basalt Prisms | hexagonal basalt columns, height hashed **per W layer** | cinder lichen, magma bulbs | column drops |
| Sulfur Fungal Forest | sulfur moss | giant 4D-dome fungi | sulfur vents (burn) |
| Magma Sea | under the lava, pumice islands | lava reeds, flame lilies | the lava sea, magma crust |
| Ash Wastes | ash dunes rippling along a diagonal of (x, z, w) | charred trees | ash slows you, grey haze |
| Soul Glass Canyons | a plateau cut by terraced canyons with soul-glass strata | soul ferns, wisp blooms, soul fire | soul sand slows you, drops |
| Emberglass Grove | glowing cinder | crystal trees with 4D star canopies | glare |
| Shattered Tesseracts | rugged rift soil | floating voidstone hypercube frames | Ana Stalkers |

**Basalt Prisms.** The spec asks for basalt columns "only fully visible along one slice
orientation". Each column is a hexagon-ish cell in (x, z), and its height is hashed per
W layer. In a slice whose hidden axis is W, you see whole columns. In a slice tilted
through W, neighbouring pixels come from different W layers and the columns shatter.

**Tesseract frames** are the 32 edges of a hypercube, with 16 glowing vertices. A
W-aligned slice through the middle crosses only the 8 edges along W (8 floating cells), and
the slice at either end shows a whole cube frame. Tilted slices show other polytopes.

### 4D portals (8:1 in x, z and w)

* **The frame.** A frame is the set of face cells around a box of air in a vertical hyperplane
  (y plus two of x, z, w). Edges and corners are optional. The remaining axis is the normal,
  the way you walk through.
  * The minimum is 10 blocks around a 1 × 2 × 1 interior; the maximum interior is 12 on every
    axis.
  * Obsidian and voidstone both count.
  * Flint and steel or a fire charge lights it; elsewhere they start a fire.
  * `findPortal` is pure, and unit tests cover all three normals and broken frames.
* **The trip.** Stand in the membrane for 4 s (1 s in creative) while the view swirls violet.
  Then the game saves and reloads into the destination realm, at x, z and w divided by 8
  (multiplied on the way back); y is only clamped.
* **Arrival.** It waits for the 27 surrounding columns, then:
  * steps into a known portal within 128 blocks on the Surface (16 in the Ember Depths),
    from the portal records saved with the world;
  * or builds a 2 × 3 × 2 obsidian portal with a platform on the nearest free ground, or
    carves one in place.
  * You arrive facing along the same normal, and must step out before the portal can take
    you back.
* **Breaking.** Breaking the frame or the membrane collapses the whole portal.
* **Death.** Dying in the Ember Depths sends you to your Surface bed or spawn (a trip).

### Mobs, structures, the boss

* **Mobs.** Seven Ember mobs (plus lava slimes), each with a body part along its own w:
  * Cinder Hounds hunt in packs.
  * Magma Drakes float, keep 9 blocks away and spit fire charges.
  * Soul Wisps float, glow and are passive.
  * Ember Brutes charge: a dash at 2.8× speed with a harder hit, then a pause.
  * Citadel Guards stand watch in citadels.
  * Slag Golems are slow and tough, with a third arm and a third leg toward +w.
* **Structures**, from data, on the same 4D grid:
  * **Citadels**: three towers side by side along W. Their floors connect only through
    corridors running along W. The builder forces the local c axis onto world W, so you climb
    by walking kata/ana, and a unit test checks the layout.
  * Forge shrines, basalt ziggurats, magma bridges (with a W branch) and ruined portals.
  * The Regent's Caldera, a 4D disc arena on the lava sea.
  * Seven loot tables.
* **The Magma Regent**: 300 HP, floating.
  * **Movement.** It hovers 7 blocks from you, 5 when enraged. It drifts along your hidden
    axis toward your slice, and steps across when you are more than 3 blocks kata/ana, so it
    cannot be cheesed along W. Leave the arena (28 blocks) and it returns to its throne and
    heals.
  * **Attacks.** Volleys of three fire charges.
  * **Lava pillars along W.** A line of 7 through your position, 3 blocks apart in W. In
    phase 2 a second line of 4 crosses your slice's right axis. Stepping kata/ana does not
    dodge the line; sidestepping in the slice does.
  * **R2.** Each pillar is announced 1.5 s ahead: flames at its base, a blinking mark on the
    radar (also kata/ana), and a warning line with the in-slice and along-W counts.
  * **Phase 2** starts at half health: three Cinder Hounds join, and attacks speed up.
  * **Loot.** The Regent Heart, 2–3 Ancient Slag ingots, ember quartz and hypercinder.

### Tests

* **Unit** (`tests/unit/ember.test.ts`, `portals.test.ts`):
  * realm data and determinism;
  * every Ember biome is reachable, and no Surface biome leaks in;
  * bedrock top and bottom, and lava fills the cavern below the sea;
  * ores and emberglass;
  * prism columns change along W;
  * Ember structures stay within their radius, with valid loot and mobs;
  * the citadel spreads along W;
  * every mob exists, and the Regent is a boss;
  * pillar lines;
  * portal frames on all three normals: broken frames, corners optional, height ≥ 2;
  * 8:1 scaling.
* **E2E**:
  * `portal.spec`: build and light a frame, the swirl, the trip at 8:1 and the arrival portal,
    water boiling away, and the way back.
  * `ember.spec`: the R6 views, the mob line-up, the biome tour, and the boss fight
    (telegraph, eruption, phase 2 with hounds, the kill and the Regent Heart).

## What's broken / limited

See [KNOWN_ISSUES.md](../../KNOWN_ISSUES.md) (Ember Depths, portals, bosses). The main points:
* A realm trip reloads the page, which takes a few seconds.
* Test worlds don't keep edited columns across trips.
* Arrival portals are always the same size.
* Fire doesn't spread.
* No striders, bartering, Slag Armor (Phase 7) or Ember advancements (Phase 8) yet.

## What's next

Phase 7:
* armor, enchanting, potions and brewing;
* farming and animal husbandry;
* smithing (Slag Armor from the Regent Heart and slag ingots);
* shields and the special 4D tools.
