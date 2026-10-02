# Phase 7 report: survival systems, enchanting, brewing, farming, animals, smithing, 4D tools

Status: **complete**. Typecheck and 176 unit tests (26 files) are green, and so are the
Phase 7 e2e specs (`phase7` ×5, `inventory-tabs`, `bricks`, `ores`, `tools4d`) and the smoke
test. They are added to `scripts/ci.sh`.

## What came in, step by step

| Step | Content |
|---|---|
| 7.1 | Item data on stacks (enchantments, names, trims), armour (8 materials, Minecraft's formula, set bonuses), hunger and saturation, 29 foods, experience and orbs, 24 status effects, the **4D Glasses** |
| 7.2 | Enchanting table (bookshelves in a 4D shell), 32 enchantments with the 4D ones (**4D Vision**, Slice Sense, Phase Strike, Kata Grip, Reach Through), anvil, grindstone, enchanted books |
| 7.3 | Brewing stand, 20 potion types (with Phase Sight and Anchor), splash potions, Bottles o' Enchanting |
| 7.4 | Farming: farmland hydrated in 4D (9×9×9), 7 crops, berry bushes, 18 saplings, bone meal |
| 7.5 | Animals: breeding, babies, tempting, leads, shearing, milking, eggs, name tags; kept animals are saved |
| 7.6 | Smithing table (Slag Upgrade, 8 trims), shields with a 4D arc, the off hand (H), Anchor Charm, held lights |
| 7.7 | 4D tools (Slicer Compass, Phase Lens, W-Anchor, Hyper Rope, Ana Pick) and weapons (spears, 4D Whip, Hyper-Chakram, throwing daggers, crossbow) |

The 4D Glasses and the 4D Vision enchantment were asked for during the phase: the glasses
outline every mob near you wherever your slice is (projected along the hidden axis), 4D Vision
adds key blocks (furnaces, chests, tables, stations, beds, spawners), found lazily per column.

## Playtest fixes in this phase

* **Creative inventory crash.** Every icon carried its own copy of the 2048×1024 icon sheet
  as a data: URL (megabytes each); the creative list has 900+ slots. Now one blob: URL in one
  stylesheet rule.
* **Creative tabs and recipe book sections** (Building, Natural, Functional, Tools &
  Utilities, Combat, Food & Drinks, Ingredients, Technical; All with sections).
* **FPS.** Profiled the current build: CPU frame logic is about 0.3 ms; the cost is on the
  GPU. The deeper underground had doubled the non-uniform bricks, and x-ray from inside rock
  marched about 57 steps per pixel. **Buried bricks** (all solid, one value on every face a ray
  can reach) are now stored as one value: a third fewer GPU bricks, x-ray views 35–50% cheaper
  (34 / 29 steps per pixel on the Surface / in the Ember Depths), pixel-identical renders (the
  `bricks` e2e test compares them, before and after digging into hidden ore). Pools grow in
  place on the GPU instead of re-uploading the world; mobs off screen are not traced.
* **Ores.** Measured 1.7% of the rock (coal at a third of its target: half its veins landed in
  the air); now about 7.4%, in fatter veins. Four new ores with uses: silver (silver arrows,
  Mirror Glass), sulfur (TNT), lumenite (spectral arrows, Lumen Blocks), tesserite (the 4D
  tools).

## Screenshots

`docs/screenshots/phase-7/` (from the `phase7` e2e spec): `glasses.png` (a cow 4 blocks
ana of the slice, invisible without the glasses, outlined with them), `survival-hud.png`
(absorption and normal hearts, hunger and the effect badges), `vision.png` (the 4D Vision test
scene; its outlines are faint at this size), `farm.png` (a sapling grown into a tree with bone
meal, a harvested carrot).

## Not done / follow-ups

See `KNOWN_ISSUES.md` (Gameplay): lit TNT and a flying chakram are not saved, crossbows lack
their own enchantments, old villagers keep their old offers, Fluxite has no circuits yet
(Phase 10).
