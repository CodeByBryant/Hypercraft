# Phase 8 report: the Hollow Void, the Void Sovereign, Phase Wings, advancements

Status: **complete**. Typecheck and 274 unit tests (37 files) are green, and so are the Phase 8
e2e specs (`void` ×6, `advancements`) and the touch spec. The two new specs are in
`scripts/ci.sh`.

## What came in, step by step

| Step | Content |
|---|---|
| 8.1 | **Realm C, the Hollow Void.** A Stronghold under every 384-block cell of the Surface holds the **Void Gate**; six Void Eyes light it; the realm itself: floating islands in black space under an aurora, six biomes, 30 blocks, the generator (`VoidGen.ts`), the central island with the Sovereign's arena and six dormant Gateway Spires, six landing islands 1024 blocks out, a return gate on the arrival platform |
| 8.2 | **Void mobs**: Void Walker (frozen while you look at it), Whisper Swarm, Starlight Serpent, Sky Vault Sentinel; island-aware spawning |
| 8.3 | **Void structures**: Void City (towers joined by bridges along W only), Sky Vault, Starlight Garden, Crystal Shrine; the new `island` placement |
| 8.4 | **The Void Sovereign**: three phases, eight pylons, phase shift, lances, light drain, the arena rules, the exit gate, the world remembering |
| 8.5 | **Phase Wings** (a 4D glider), Starlight Rockets, the **Starlight tier** (tools, armour), the **Phase Step** set bonus |
| 8.6 | **Advancements v1**: 61 goals in eight categories, key **L**, toasts, saved with the world |
| 8.7 | This report, docs, CI, release 0.8.0; a 🏆 button on touch screens for the advancements screen |

## The Hollow Void, in 4D

* **The gate is one cell with six frames.** A Void Gate is a single air cell sunk into a floor with a
  frame on each of its six horizontal faces: ±x, ±z and ±w. In any one slice you see four of them;
  the other two are exactly kata and ana of the cell. Filling the sixth lights it. The Void Eye is
  phase dust plus hypercinder (so the Ember Depths come first); held, it points at the nearest
  Stronghold like an atlas.
* **Islands are 3-balls in (x, z, w).** An island is a lens whose slice is a disc that grows and
  shrinks as you step kata/ana, flat on top with a wobbling shore and spikes underneath. One island
  layer per (x, z, w) column keeps heights, biomes, spawning and structures working unchanged. The
  generator and `sample()` share one shape function, so structures and spawns agree with the blocks
  exactly (the tests check it column by column).
* **The sky has no sun.** `RealmDef.voidSky` gives an open black-violet sky with stars and aurora
  curtains defined on world directions: rotate your slice and the curtains sweep past. (`uAurora` in
  the ray marcher; the rest of the sky code is untouched.)
* **Gateway Spires.** Six spires on the central island (one per horizontal direction, ±x, ±z, ±w)
  carry you 1024 blocks out to a landing island on that axis, where another spire brings you home.
  They are dormant stone until the Sovereign falls.
* **Void City bridges.** Towers stack along c (the hidden axis), nine apart, and are joined by
  one-block bridges that run along W *only*: from any one slice a bridge is a lone block, and a
  tower has neighbours you cannot see.

## Mobs

| Mob | Gimmick |
|---|---|
| Void Walker | tall, fast, silent. In your slice, within ~26° of your view and in plain sight it **freezes**; one kata/ana of you it is *not* watched, however you turn (`gaze.ts`). Unwatched and far it blinks next to you (often off your slice) and hits for 9 |
| Whisper Swarm | nine motes spread through x, z and w: a different cloud from every slice. Stings and slows |
| Starlight Serpent | undulates through x and w (an S in your slice, new `wave` animation), keeps its distance, spits starlight |
| Sky Vault Sentinel | a crystal guard that never moves; dormant until a vault chest is opened near it (or you strike it or walk up), then fans three starlight shots |

## The Void Sovereign

It wakes on its throne when you come within 32 blocks (once; a defeated world never sees it again).

* **Pylons.** Eight crystals heal it (1.2 hp/s each) while they stand: four on the ring in the throne's
  own slice, four kata/ana of it (w = ±11). The hidden-axis radar shows them (magenta). Breaking any
  crystal of a pylon, with a pick or an arrow, shatters the whole pylon.
* **Phase I** (above 66%): fans of starlight, blinking about the arena. **Phase II** (below 66%):
  it **phase shifts**: it steps off your slice along the hidden axis, where nothing can touch it,
  sends Whisper Swarms, then steps back and fires; **void lances** come down along W through you,
  announced 1.5 s ahead on the radar (like the Regent's pillars). **Phase III** (below 33%): it
  **drains the light** (torches and lanterns within 12 blocks go out as items, you are blinded for
  a few seconds) and lances also sweep across your slice.
* **Arena rules.** While it lives nothing within 34 blocks may be broken or placed (so no
  pillaring up or tunnelling in through W); explosions and the Ana Pick spare the arena; only the
  pylons yield. It returns home and heals if you leave (46 blocks) and follows you through W.
* **Defeat.** The pylons crumble, an exit gate opens on the throne, the six Gateway Spires light, a
  Sovereign's Heart drops with 12000 experience, and `SavedState.data.voidSovereign` remembers.

## Phase Wings and the Starlight tier

* **Phase Wings** (a chest-slot item, 432 wear; every Sky Vault holds a pair): in the air, falling,
  press jump to glide. It is Minecraft's elytra model with "horizontal" meaning x, z **and** w, and
  the heading is your 4D view direction: **rotate the slice mid-flight and you bank through W**.
  Dive to gain speed, pull up to climb. Hitting a wall or the ground at speed costs hit points by the
  speed lost; a gentle landing costs none. Wear: a point a second.
* **Starlight Rocket** (shard + paper + sulfur): a shove along the heading while gliding.
* **Starlight tier**: tools and armour from starlight ingots (smelted from shards). A full set gives
  **Phase Step**: the first blow every ten seconds passes through you and you slip two blocks along W.

## Advancements

61 goals: Surface 10, Mining 8, Husbandry 6, Combat 6, Magic 5, The Fourth Dimension 8, Ember
Depths 5, Hollow Void 13. Criteria: hold something (or anything tagged), mine, kill, eat, enter a
realm, visit N biomes, events, and counters (largest slice tilt, blocks walked along the hidden
axis, blocks glided). `docs/how-to/add-an-advancement.md` is the recipe.

## Numbers

6 biomes (106 in all), 30 blocks, 7 items, 5 mobs (58), 5 structures (43), the Stronghold's three
loot tables and three more for the islands; 916 of 1024 textures used.

## Screenshots

`docs/screenshots/phase-8/` (from the `void` and `advancements` e2e specs):

* the lit Void Gate: `void-0-gate-lit.png`
* the central island in the R6 views: `void-1-axis-aligned.png`, `void-2-xw-30.png`,
  `void-3-xw45-zw45.png` (the island is a 3-ball: the outline changes as the slice tilts)
* a landing island and its return beam: `void-4-landing.png`
* the four island mobs: `void-5-mobs.png`
* a Sky Vault (`void-6-sky-vault.png`, tilted: `void-6b-sky-vault-xw30.png`), a Void City
  (`void-7-void-city.png`, `void-7b-void-city-xw45zw45.png`), a Starlight Garden
  (`void-8-starlight-garden.png`)
* the Sovereign with its pylons, the radar and the boss bar: `void-9-sovereign.png`
* gliding: `void-10-glide.png`, and banking through W: `void-11-glide-xw45.png`
* the advancements screen and a toast: `advancements.png`

## Not done / follow-ups

See `KNOWN_ISSUES.md`: the Sovereign cannot be summoned again after it falls, the wings are not
drawn on the player (there is no third-person view yet), the Void has no weather, and balance
numbers (pylon healing, lance timing, glide speeds) are a first pass that real playtests will move.
