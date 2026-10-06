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

test('food and fishing: berries, fruit, fibre, a bite and a catch', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=qolfood', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.setView({ yaw: 0, pitch: 0 });
    await hc.frames(2);
    const s = hc.state();
    const f = s.fwd;
    const ax = Math.abs(f[0]!) > Math.abs(f[2]!) ? 0 : 2;
    const sg = Math.sign(f[ax]!) || 1;
    const side = ax === 0 ? 2 : 0;
    const base = [Math.floor(s.pos[0]!), Math.floor(s.pos[1]!), Math.floor(s.pos[2]!), Math.floor(s.pos[3]!)];
    const at = (fwd: number, sd: number, dy: number): [number, number, number, number] => {
      const c = [...base] as [number, number, number, number];
      c[ax] += fwd * sg;
      c[side] += sd;
      c[1] += dy;
      return c;
    };
    // Soil with a ripe blueberry bush on it, and a young one.
    for (let sd = -1; sd <= 1; sd++) for (let dy = 0; dy <= 3; dy++) hc.setBlock(...at(2, sd, dy), 'air');
    hc.setBlock(...at(2, 0, -1), 'dirt');
    hc.setBlock(...at(2, 0, 0), 'blueberry_bush');
    hc.clearInventory();
    hc.useOn(...at(2, 0, 0));
    const picked = hc.inventory().filter((x) => x[1] === 'blueberries').reduce((a, x) => a + x[2], 0) + hc.dropped().filter((d) => d[0] === 'blueberries').reduce((a, d) => a + d[1], 0);
    const afterPick = hc.blockAt(...at(2, 0, 0));
    // Palm fronds give coconuts, long grass fibre (shears keep the plant).
    let coconuts = 0, fibre = 0;
    for (let k = 0; k < 120; k++) {
      hc.setBlock(...at(2, 1, 0), 'palm_fronds');
      hc.harvestAt(...at(2, 1, 0));
      hc.setBlock(...at(2, -1, 0), 'tall_grass');
      hc.harvestAt(...at(2, -1, 0));
    }
    for (const d of hc.dropped()) {
      if (d[0] === 'coconut') coconuts += d[1];
      if (d[0] === 'plant_fibre') fibre += d[1];
    }
    // Fishing: a pond ahead, look at it, cast, wait for the (forced) bite, reel in.
    for (let fwd = 3; fwd <= 7; fwd++) for (let sd = -3; sd <= 3; sd++) {
      hc.setBlock(...at(fwd, sd, -3), 'stone');
      for (let dy = -2; dy <= -1; dy++) hc.setBlock(...at(fwd, sd, dy), 'water');
      for (let dy = 0; dy <= 3; dy++) hc.setBlock(...at(fwd, sd, dy), 'air');
    }
    hc.setBlock(...at(2, 0, 0), 'air');
    for (let fwd = 1; fwd <= 2; fwd++) for (let sd = -3; sd <= 3; sd++) hc.setBlock(...at(fwd, sd, -1), 'stone');
    hc.clearInventory();
    hc.give('fishing_rod');
    hc.select(0);
    hc.setView({ pitch: -18 });
    await hc.frames(3);
    hc.use();
    await hc.frames(2);
    const cast = hc.fishing();
    hc.fishBite();
    await hc.frames(3);
    const bit = hc.fishing();
    hc.use();
    await hc.frames(2);
    const after = hc.fishing();
    const inv = hc.inventory();
    const rod = inv.find((x) => x[1] === 'fishing_rod');
    const catches = inv.filter((x) => x[1] !== 'fishing_rod').length + hc.dropped().filter((d) => d[0] !== 'coconut' && d[0] !== 'plant_fibre' && d[0] !== 'blueberries').length;
    return { picked, afterPick, coconuts, fibre, cast: !!cast, bit: (bit?.bite ?? 0) > 0, after, rodWear: rod?.[3] ?? -1, catches };
  });
  expect(r.picked).toBeGreaterThan(0);
  expect(r.afterPick).toBe('blueberry_bush_young');
  expect(r.coconuts).toBeGreaterThan(0);
  expect(r.fibre).toBeGreaterThan(0);
  expect(r.cast).toBe(true);
  expect(r.bit).toBe(true);
  expect(r.after).toBeNull();
  expect(r.rodWear).toBe(1);
  expect(r.catches).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
