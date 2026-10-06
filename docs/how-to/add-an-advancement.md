# How to add an advancement

Advancements (Phase 8, key **L**) are goals in eight categories (Surface, Mining, Husbandry,
Combat, Magic, The Fourth Dimension, Ember Depths, Hollow Void). Each one has a parent, an icon,
a title, a description and ONE criterion. Completing one shows a toast, pays a little
experience and is saved with the world (`SavedState.data.advancements`).

Everything is data in `src/content/advancements.ts`; the tracker is `src/game/Advancements.ts`
(pure state, unit tested) and the screen `src/ui/AdvancementsScreen.ts`.

## 1. Add the entry

```ts
A('void/vault', 'void', 'Vault Raider', 'Find Phase Wings in a Sky Vault', 'phase_wings',
  { type: 'have', items: ['phase_wings'] }, 50, 'void/sovereign'),
```

`A(id, category, title, description, icon, criterion, xp, parent?)`:

* `id` is `category/name`, unique; the first entry of a category has no parent (its root); every
  other entry names its parent, which must be in the same category. The screen draws the tree.
* `title` is unique across all advancements. `icon` is an item name (blocks have items too).
* `xp` is the experience orbs paid on completion (0 for the world's root).

## 2. Pick a criterion

| criterion | completes when | fed by |
| --------- | -------------- | ------ |
| `{ type: 'start' }` | the world is entered (only the first root) | `Advancements.start()` |
| `{ type: 'have', items: [...], count? }` | any of the items (or `#tag`: any item with that tag, e.g. `#log`, `#potion`) is in your inventory, armour or off hand; `count` is the total | polled once a second (`Game.updateAdvancements`) |
| `{ type: 'mine', blocks: [...] }` | you break one of these blocks (survival mining) | `Game.harvestTarget` |
| `{ type: 'kill', mobs: [...] }` | you kill one of these mobs (`'*hostile'`: any hostile mob) | `MobHost.mobDied` when you hit it last |
| `{ type: 'eat', items: [...] }` | you eat one of these | `Game.consume` |
| `{ type: 'realm', realm }` | you are in this realm | the one-second poll |
| `{ type: 'biome', count }` | you have been in this many different biomes | the one-second poll |
| `{ type: 'event', name }` | something happened: `sleep`, `trade`, `plant`, `breed`, `fish`, `block`, `enchant`, `anvil`, `phase_strike`, `void_gate`, `phase_step`, `rocket` | `Advancements.event(name)` from the code that does it |
| `{ type: 'stat', stat, value }` | a counter reached a value: `slice_tilt` (the largest tilt of your slice, in degrees), `w_walk` (blocks walked along the hidden axis), `glide` (blocks glided) | `maxStat` / `addStat`, every frame in `Game.updateAdvancements` |

`have` is the right choice for anything you can hold: crafting it, finding it in a chest and
trading for it all count, and there is nothing to hook.

## 3. A new event or counter

Add the name to `EVENTS` / `STATS` in `advancements.ts`, call `this.adv.event('name')` (or
`maxStat` / `addStat`) where it happens in `Game.ts`, and give at least one advancement that
uses it. The unit test refuses events and stats nobody uses, and names that do not exist.

## 4. Test it

`tests/unit/advancements.test.ts` validates the whole table (unique ids and titles, parents in
the same category, no cycles, every icon / item / tag / block / mob / realm / event / stat
exists, a root per category) and drives the tracker. `tests/e2e/advancements.spec.ts` earns a
few in the real game, checks the toast and the screen, and the save. In an e2e test,
`hc.grantAdvancement(id)`, `hc.advEvent(name)` and `hc.advancements()` drive and read the
tracker.
