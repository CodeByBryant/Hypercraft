import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 3: survival mining with tools and drops, crafting through the inventory UI and its
// recipe book, and smelting in a furnace (block entity ticking with the world).
test('survival mining, recipe-book crafting and furnace smelting', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, 'res=180&rd=3&seed=items', errors);
  const count = async (name: string) => (await page.evaluate(() => window.__hc.inventory())).filter((s) => s[1] === name).reduce((a, s) => a + s[2], 0);

  // Mine the garden floor (smooth stone) in survival with a wooden pickaxe: takes time, drops.
  await page.evaluate(() => {
    window.__hc.setMode('survival');
    window.__hc.clearInventory();
    window.__hc.give('wood_pickaxe');
    window.__hc.select(0);
    window.__hc.setView({ pitch: -89 });
  });
  await page.evaluate(() => window.__hc.frames(3));
  const t = await page.evaluate(() => window.__hc.target());
  expect(t?.name).toBe('smooth_stone');
  const secs = await page.evaluate(() => window.__hc.mine(20000));
  expect(secs).toBeGreaterThan(0.8); // survival mining is not instant (1.5 s with a wooden pickaxe)
  expect(secs).toBeLessThan(10);
  await expect.poll(() => count('smooth_stone'), { timeout: 15_000 }).toBe(1); // the drop was picked up
  const inv = await page.evaluate(() => window.__hc.inventory());
  expect(inv.find((s) => s[1] === 'wood_pickaxe')![3]).toBe(1); // one point of tool wear

  // Crafting with the recipe book in the 2x2 inventory grid.
  await page.evaluate(() => {
    window.__hc.clearInventory();
    window.__hc.give('log', 2);
    window.__hc.openInventory();
  });
  await expect.poll(() => page.evaluate(() => window.__hc.screenOpen())).toBe(true);
  await page.click('.inv-book .islot[data-item="planks"]');
  await page.click('.islot.result', { modifiers: ['Shift'] });
  expect(await count('planks')).toBe(4);
  expect(await count('log')).toBe(1);
  await page.click('.inv-book .islot[data-item="stick"]');
  await page.click('.islot.result'); // result onto the cursor...
  await page.click('.inv-hotbar .islot[data-slot="8"]'); // ...then into hotbar slot 9
  expect(await count('stick')).toBe(4);
  expect(await count('planks')).toBe(2);
  if (process.env.SHOT_DIR) {
    mkdirSync(process.env.SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.SHOT_DIR}/inventory.png` });
  }
  await page.evaluate(() => window.__hc.closeScreen());

  // Furnace: raw iron + coal -> iron ingots while the block is lit. (We are standing in the
  // hole we mined; fly up so the furnace does not go into our own body.)
  await page.evaluate(() => {
    const s = window.__hc.state();
    window.__hc.setMode('creative');
    window.__hc.setFlying(true);
    window.__hc.teleport(s.pos[0]!, s.pos[1]! + 2.5, s.pos[2]!, s.pos[3]!);
    window.__hc.setView({ pitch: -89 });
  });
  await page.evaluate(() => window.__hc.frames(3));
  const t2 = await page.evaluate(() => window.__hc.target());
  expect(t2).not.toBeNull();
  expect(await page.evaluate(() => window.__hc.placeTarget('furnace'))).toBe(true);
  const f = [t2!.x, t2!.y + 1, t2!.z, t2!.w] as const;
  await page.evaluate(([x, y, z, w]) => {
    window.__hc.beSet(x, y, z, w, 0, 'raw_iron', 2);
    window.__hc.beSet(x, y, z, w, 1, 'coal', 1);
    window.__hc.tickWorld(21);
  }, f);
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.beGet(x, y, z, w, 2), f)).toEqual(['iron_ingot', 2]);
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x, y, z, w), f)).toBe('lit_furnace');
  expect(errors).toEqual([]);
});
