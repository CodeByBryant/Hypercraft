import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 7: 4D Glasses, armour, hunger, effects and experience.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase7';

test('4D Glasses draw mobs off-slice; armour, hunger and effects work in survival', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=glasses', errors);
  mkdirSync(dir(), { recursive: true });

  // A mob 6 blocks ahead but 4 blocks kata of the slice: invisible without the glasses.
  const seen = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.setView({ pitch: -10 });
    hc.spawnMobAhead('ana_cow', 6, 0, 4);
    hc.freezeMobs(true);
    await hc.frames(3);
    const before = { packed: hc.packedMobs(), drawn: hc.visionMobs() };
    hc.wear(0, '4d_glasses');
    await hc.frames(3);
    return { before, after: { drawn: hc.visionMobs(), lines: hc.lineSegments() } };
  });
  expect(seen.before.packed).toBe(0); // not in the slice
  expect(seen.before.drawn).toBe(0);
  expect(seen.after.drawn).toBe(1);
  expect(seen.after.lines).toBeGreaterThan(40);
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/glasses.png` });

  // Survival: armour soaks damage, food refills hunger, effects tick.
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.wear(0, null);
    await hc.frames(2);
    hc.setHealth(20);
    hc.hurt(10);
    const bare = 20 - hc.vitals().health;
    await hc.frames(40); // past the hit cooldown
    for (let k = 0; k < 4; k++) hc.wear(k, ['hyperite_helmet', 'hyperite_chestplate', 'hyperite_leggings', 'hyperite_boots'][k]!);
    hc.setHealth(20);
    hc.hurt(10);
    const armored = 20 - hc.vitals().health;
    const armor = hc.survival().armor;
    // Eat: hold use with steak in hand.
    hc.clearInventory();
    hc.give('cooked_beef', 4);
    hc.select(0);
    hc.setFood(6, 0);
    await hc.holdUse(2200);
    const food = hc.survival().food;
    hc.applyEffect('speed', 30, 1);
    hc.applyEffect('absorption', 60, 0);
    await hc.frames(20); // the HUD refreshes ten times a second
    const s = hc.survival();
    const hud = { food: !!document.querySelector('.vitals .food'), effects: document.querySelectorAll('.effects .effect').length, xp: (document.querySelector('.xpbar') as HTMLElement).style.display };
    return { bare, armored, armor, food, effects: s.effects, absorption: s.absorption, hud };
  });
  expect(r.bare).toBeCloseTo(10, 0);
  expect(r.armor).toBe(20);
  expect(r.armored).toBeLessThan(4);
  expect(r.food).toBe(14);
  expect(r.effects.map((e) => e[0])).toEqual(expect.arrayContaining(['speed', 'absorption']));
  expect(r.absorption).toBe(4);
  expect(r.hud.effects).toBe(2);
  expect(r.hud.xp).toBe('block');
  await page.screenshot({ path: `${dir()}/survival-hud.png` });
  expect(errors).toEqual([]);
});

test('enchanting table (4D bookshelves), anvil screen, 4D Vision shows key blocks off-slice', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=enchant', errors);
  mkdirSync(dir(), { recursive: true });
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMobSpawning(false);
    hc.clearMobs();
    const p = hc.state().pos.map(Math.floor);
    const [x, y, z, w] = [p[0]! + 3, p[1]!, p[2]!, p[3]!];
    // A table with shelves two blocks out in x, z and w (air between).
    for (let dy = 0; dy < 3; dy++) for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -3; c <= 3; c++) hc.setBlock(x + a, y + dy, z + b, w + c, 'air');
    hc.setBlock(x, y, z, w, 'enchanting_table');
    let n = 0;
    for (const [a, b, c] of [[2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2], [2, 2, 0], [-2, 0, 2]] as const)
      for (let dy = 0; dy < 2; dy++) {
        hc.setBlock(x + a, y + dy, z + b, w + c, 'bookshelf');
        n++;
      }
    const shelves = hc.shelves([x, y, z, w]);
    hc.setMode('survival');
    const poor = hc.enchantAt([x, y, z, w], 'iron_sword', 3, 2);
    hc.addXp(1500); // level 30+
    const rich = hc.enchantAt([x, y, z, w], 'iron_sword', 3, 2);
    // The anvil screen renders.
    hc.setBlock(x - 3, y, z, w, 'anvil');
    hc.openScreen('anvil', [x - 3, y, z, w]);
    await hc.frames(2);
    const anvilUi = !!document.querySelector('.anvil-name');
    hc.closeScreen();
    // 4D Vision: a crafting table 3 blocks kata of the slice is outlined.
    hc.setMode('creative');
    hc.setBlock(x, y, z, w - 3, 'crafting_table');
    hc.wearTagged(0, 'iron_helmet', { ench: [['4d_vision', 1]] });
    await hc.frames(12);
    return { n, shelves, poor, rich, anvilUi, keys: hc.keyBlocksFound(), lines: hc.lineSegments() };
  });
  expect(r.shelves).toBe(15); // 16 placed, capped at 15
  expect(r.poor.ok).toBe(false); // no levels
  expect(r.rich.ok).toBe(true);
  expect(r.rich.ench.length).toBeGreaterThan(0);
  expect(r.rich.level).toBeLessThan(31);
  expect(r.anvilUi).toBe(true);
  expect(r.keys).toBeGreaterThanOrEqual(2); // the table and the crafting table
  expect(r.lines).toBeGreaterThan(20);
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/vision.png` });
  expect(errors).toEqual([]);
});

test('brewing stand brews, potions are drunk and splashed', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=brew', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMobSpawning(false);
    hc.clearMobs();
    const p = hc.state().pos.map(Math.floor);
    const [x, y, z, w] = [p[0]! + 2, p[1]!, p[2]!, p[3]!];
    hc.setBlock(x, y, z, w, 'brewing_stand');
    hc.beSet(x, y, z, w, 0, 'potion_water');
    hc.beSet(x, y, z, w, 1, 'potion_water');
    hc.beSet(x, y, z, w, 3, 'ember_wart');
    hc.beSet(x, y, z, w, 4, 'cinder_powder');
    hc.tickWorld(21);
    const first = [hc.beGet(x, y, z, w, 0), hc.beGet(x, y, z, w, 1), hc.beGet(x, y, z, w, 3)];
    hc.beSet(x, y, z, w, 3, 'sugar');
    hc.tickWorld(21);
    const second = hc.beGet(x, y, z, w, 0);
    // Drink a strong swiftness potion.
    hc.setMode('survival');
    hc.clearInventory();
    hc.give('potion_swiftness_strong');
    hc.select(0);
    await hc.holdUse(2200);
    const drank = { effects: hc.survival().effects, inv: hc.inventory() };
    // Splash poison on a cow next to you.
    const cow = hc.spawnMobAhead('ana_cow', 2.5);
    hc.clearInventory();
    hc.give('splash_potion_poison');
    hc.select(0);
    hc.setView({ pitch: -40 });
    await hc.frames(2);
    hc.use();
    await hc.frames(40);
    const cowHit = hc.mobs().find((m) => m.id === cow);
    return { first, second, drank, cowHealth: cowHit?.health ?? -1, self: hc.survival().effects };
  });
  expect(r.first[0]?.[0]).toBe('potion_awkward');
  expect(r.first[1]?.[0]).toBe('potion_awkward');
  expect(r.first[2]).toBeNull(); // the wart was used up
  expect(r.second?.[0]).toBe('potion_swiftness');
  expect(r.drank.effects.find((e) => e[0] === 'speed')?.[1]).toBe(1);
  expect(r.drank.inv.some(([, n]) => n === 'glass_bottle')).toBe(true);
  expect(r.self.some((e) => e[0] === 'poison') || r.cowHealth < 10).toBe(true);
  expect(errors).toEqual([]);
});

test('farming: till, plant, hydrate in 4D, grow, bone meal, harvest; saplings grow trees', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=farm', errors);
  mkdirSync(dir(), { recursive: true });
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    const p = hc.state().pos.map(Math.floor);
    const [x, y, z, w] = [p[0]!, p[1]! - 1, p[2]! + 3, p[3]!];
    // A grass plot with water 3 blocks away along W only (4D hydration).
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 4; c++) {
      hc.setBlock(x + a, y, z, w + c, 'grass');
      hc.setBlock(x + a, y + 1, z, w + c, 'air');
      hc.setBlock(x + a, y + 2, z, w + c, 'air');
    }
    hc.setBlock(x, y, z, w + 3, 'water');
    // Till it with a hoe (look down at it).
    hc.setMode('survival');
    hc.clearInventory();
    hc.give('iron_hoe');
    hc.give('wheat_seeds', 4);
    hc.give('bone_meal', 8);
    hc.teleport(x + 0.5, y + 1, z - 1.5, w + 0.5);
    hc.freezeMobs(true);
    await hc.frames(3);
    const tgt = { name: 'plot' };
    hc.select(0);
    hc.useOn(x, y, z, w);
    const tilled = hc.blockAt(x, y, z, w);
    hc.select(1);
    hc.useOn(x, y, z, w);
    const planted = hc.blockAt(x, y + 1, z, w);
    const hydrated = hc.hydrated(x, y, z, w);
    // Growth ticks: farmland turns moist, the crop grows (once light reaches the new plot).
    await hc.frames(20);
    hc.farmTicks(x, y, z, w, 1);
    const moist = hc.blockAt(x, y, z, w);
    let grown = '';
    for (let k = 0; k < 40 && grown !== 'wheat_7'; k++) {
      grown = hc.farmTicks(x, y + 1, z, w, 2);
      await hc.frames(1);
    }
    // A fresh plant and bone meal.
    hc.setBlock(x, y + 1, z, w, 'carrots_0');
    hc.select(2);
    for (let k = 0; k < 4; k++) hc.useOn(x, y + 1, z, w);
    const meal = hc.blockAt(x, y + 1, z, w);
    // Harvest the wheat-grown carrots: drops.
    hc.harvestAt(x, y + 1, z, w);
    await hc.frames(2);
    const drops = hc.dropped().map((d) => d[0]);
    // A sapling grows into an oak.
    hc.setBlock(x + 1, y, z, w - 1, 'grass');
    for (let k = 1; k < 9; k++) hc.setBlock(x + 1, y + k, z, w - 1, 'air');
    hc.setBlock(x + 1, y + 1, z, w - 1, 'oak_sapling');
    const tree = hc.growSapling(x + 1, y + 1, z, w - 1);
    return { tgt: tgt?.name, tilled, planted, hydrated, moist, grown, meal, drops, tree, trunk: hc.blockAt(x + 1, y + 2, z, w - 1), tracked: hc.farmCount() };
  });
  expect(r.tilled).toBe('farmland');
  expect(r.planted).toBe('wheat_0');
  expect(r.hydrated).toBe(true);
  expect(r.moist).toBe('farmland_moist');
  expect(r.grown).toBe('wheat_7');
  expect(r.meal).toBe('carrots_3');
  expect(r.drops).toContain('carrot');
  expect(r.tree).toBe(true);
  expect(r.trunk).toBe('log');
  expect(r.tracked).toBeGreaterThan(0);
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/farm.png` });
  expect(errors).toEqual([]);
});
