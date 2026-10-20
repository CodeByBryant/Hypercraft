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
