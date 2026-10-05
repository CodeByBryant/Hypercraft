import { expect, test } from '@playwright/test';
import { boot } from './util';

// The "livable world" pass (0.7.1): wood families, food, fishing, animals, graves, nights.

test('wood families: doors open and close, axes strip logs', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=qolwood', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.setView({ yaw: 0, pitch: -20 });
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!) + 3, w = Math.floor(s.pos[3]!);
    // A pad to stand the door on, air above it.
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      hc.setBlock(x + dx, y - 1, z + dz, w, 'stone');
      for (let dy = 0; dy <= 3; dy++) hc.setBlock(x + dx, y + dy, z + dz, w, 'air');
    }
    hc.clearInventory();
    hc.give('jungle_door');
    hc.select(0);
    hc.useOn(x, y - 1, z, w);
    const placed = [hc.blockAt(x, y, z, w), hc.blockAt(x, y + 1, z, w), hc.inventory().length];
    hc.clearInventory();
    hc.useOn(x, y, z, w);
    const opened = [hc.metaAt(x, y, z, w), hc.metaAt(x, y + 1, z, w)];
    await hc.frames(3);
    hc.useOn(x, y + 1, z, w);
    const closed = [hc.metaAt(x, y, z, w), hc.metaAt(x, y + 1, z, w)];
    // Breaking the upper half takes both and drops one door.
    const broke = hc.harvestAt(x, y + 1, z, w);
    await hc.frames(2);
    const after = [hc.blockAt(x, y, z, w), hc.blockAt(x, y + 1, z, w)];
    const drops = hc.dropped().filter((d) => d[0] === 'jungle_door').reduce((a, d) => a + d[1], 0);
    // Strip a log with an axe.
    hc.setBlock(x, y, z, w, 'redwood_log');
    hc.give('iron_axe');
    hc.select(0);
    hc.useOn(x, y, z, w);
    const stripped = hc.blockAt(x, y, z, w);
    const wear = hc.inventory()[0]?.[3] ?? -1;
    return { placed, opened, closed, broke, after, drops, stripped, wear };
  });
  expect(r.placed).toEqual(['jungle_door', 'jungle_door_top', 0]);
  expect(r.opened[0]).toBeGreaterThanOrEqual(6);
  expect(r.opened[1]).toBe(r.opened[0]);
  expect(r.closed[0]).toBe(r.opened[0]! - 6);
  expect(r.closed[1]).toBe(r.closed[0]);
  expect(r.broke).toBe(true);
  expect(r.after).toEqual(['air', 'air']);
  expect(r.drops).toBe(1);
  expect(r.stripped).toBe('stripped_redwood_log');
  expect(r.wear).toBe(1);
  expect(errors).toEqual([]);
});
