# How to add an item, a recipe or a tool tier

## A new material item

1. Append an `ItemDef` to `ITEMS` in `src/content/items.ts` with a name, display name, group
   and an `icon` (`shape` from `src/content/itemIcons.ts`, colours = main, shade, accent).
   Add `fuel` if it burns.
2. Make it obtainable: a drop in `src/content/mining.ts`, a smelting recipe, or a crafting
   recipe in `src/content/recipes.ts`.
3. `npm test`: the item registry, the mining table and every recipe are validated (unknown
   names or ingredients that match no item fail the tests).

## A block item

Nothing to do: every block gets an item automatically. Use `BLOCK_ITEM_EXTRAS` for fuel
value or creative group, `NO_ITEM_BLOCKS` to hide technical blocks, and `MINING` for its tool
requirement and drops.

## A tool tier

Add a `ToolTierDef` to `src/content/tiers.ts` (harvest level, speed, durability, damage,
material, icon colours). `items.ts` generates the five tools and `recipes.ts` their recipes
from the tier's `material` automatically.

## A new icon shape

Add the shape name to `IconShape` in `src/content/types.ts` and a `case` in `paintIcon()`
(`src/content/itemIcons.ts`) using the small painter (lines, polygons, discs).

## A weapon, armour, food or 4D tool (Phase 7)

* **Armour**: give the item `armor: { slot: 'head' | 'chest' | 'legs' | 'feet', points,
  toughness }` (and a `set` name for set bonuses) plus the `armor` and `armor_<slot>` tags.
  Right click equips it; enchantments follow the slot. `src/content/armor.ts` generates a
  material's four pieces and their recipes from one `ARMOR_MATERIALS` entry.
* **Food**: `food: { nutrition, saturation }` (Minecraft's numbers), with `effects` (chance per
  effect), `always: true` to eat when full, `remainder` (bowls, bottles). See
  `src/content/food.ts`.
* **A melee weapon that is not a tool**: `weapon: { damage, cooldown }` with `reach` and
  `hiddenReach` (spears: hits kata/ana of the slice) or `area` (the 4D Whip). Tag it `weapon`
  so it takes sword enchantments. See `src/content/tools4d.ts`.
* **Thrown and shot things**: `use: 'dagger' | 'chakram' | 'crossbow'`; arrows are any item
  tagged `arrow` with an `ARROWS` entry (damage, undead multiplier, seconds of glow).
* **An engine use** (`use` / `readout` values) needs code in `Game.useItem` (or the hold-use
  branch of `Game.handleInput` for things you hold) and, for readouts, `Hud.updateReadout`.
