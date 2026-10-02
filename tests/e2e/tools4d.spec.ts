import { expect, test } from '@playwright/test';
import { boot } from './util';

// Phase 7.7: the 4D tools and weapons, driven like a player would.

interface G {
  mobs: { list: { id: number; health: number; pos: Float64Array }[] };
  targetMob: { id: number } | null;
  projectiles: { list: { boomerang?: unknown }[] };
  anchorCd: number;
  player: { pos: Float64Array; cam: { H: Float64Array } };
}

test('4D tools and weapons', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=tools4d', errors);

  // Spear: a mob 2 blocks ana of the slice (its body is out of it), 3.5 ahead: a bare hand
  // cannot reach it, a spear can (and hits it).
  const spear = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.setView({ pitch: -12 });
    hc.clearInventory();
    const id = hc.spawnMobAhead('ana_cow', 3.5, 0, 2);
    hc.freezeMobs(true);
    await hc.frames(3);
    const bare = g.targetMob?.id === id;
    hc.give('spear');
    hc.select(0);
    await hc.frames(3);
    const targeted = g.targetMob?.id === id;
    const before = g.mobs.list.find((m) => m.id === id)!.health;
    await hc.attack();
    await hc.frames(2);
    return { bare, targeted, hurt: before - (g.mobs.list.find((m) => m.id === id)?.health ?? 0) };
  });
  expect(spear.bare).toBe(false);
  expect(spear.targeted).toBe(true);
  expect(spear.hurt).toBeGreaterThan(0);

  // 4D Whip: one swing hits a mob in the slice and one 1.5 kata of it.
  const whip = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.clearMobs();
    hc.clearInventory();
    hc.give('hyper_whip');
    hc.select(0);
    hc.setView({ pitch: 0 });
    const a = hc.spawnMobAhead('ana_cow', 2.2, 0.6, 0);
    const b = hc.spawnMobAhead('ana_cow', 2.2, -0.6, 1.5);
    await hc.frames(40); // full swing
    const h0 = g.mobs.list.map((m) => m.health);
    await hc.attack();
    await hc.frames(2);
    const hurt = g.mobs.list.filter((m, i) => m.health < h0[i]!).map((m) => m.id);
    return { a: hurt.includes(a), b: hurt.includes(b) };
  });
  expect(whip.a).toBe(true);
  expect(whip.b).toBe(true);

  // Hyper-Chakram: thrown, cuts a mob, comes back to the hand.
  const chakram = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.clearMobs();
    hc.clearInventory();
    hc.give('hyper_chakram');
    hc.select(0);
    hc.setView({ pitch: -4 });
    const id = hc.spawnMobAhead('ana_cow', 5, 0, 1.5);
    const before = g.mobs.list.find((m) => m.id === id)!.health;
    hc.use();
    await hc.frames(3);
    const flying = g.projectiles.list.some((p) => p.boomerang) && hc.inventory().length === 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 15_000 && g.projectiles.list.some((p) => p.boomerang)) await hc.frames(1);
    return { flying, back: hc.inventory().some((s) => s[1] === 'hyper_chakram'), hurt: before - (g.mobs.list.find((m) => m.id === id)?.health ?? 0) };
  });
  expect(chakram.flying).toBe(true);
  expect(chakram.back).toBe(true);
  expect(chakram.hurt).toBeGreaterThan(0);

  // W-Anchor: sneak-use marks the spot; walk off; use brings you back.
  const anchor = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.clearMobs();
    hc.clearInventory();
    hc.give('w_anchor');
    hc.select(0);
    hc.setView({ pitch: 60 }); // at the sky: nothing to click
    const s0 = hc.state().pos;
    hc.key('ShiftLeft', true);
    hc.use();
    await hc.frames(3);
    hc.key('ShiftLeft', false);
    await hc.frames(3);
    hc.teleport(s0[0]! + 5, s0[1]!, s0[2]!, s0[3]! + 3);
    await hc.frames(5);
    const away = hc.state().pos;
    hc.use();
    await hc.frames(5);
    const back = hc.state().pos;
    return { mark: hc.inventory()[0]?.[1], away: Math.hypot(away[0]! - s0[0]!, away[3]! - s0[3]!), back: Math.hypot(back[0]! - s0[0]!, back[2]! - s0[2]!, back[3]! - s0[3]!), cd: g.anchorCd };
  });
  expect(anchor.away).toBeGreaterThan(4);
  expect(anchor.back).toBeLessThan(0.8);
  expect(anchor.cd).toBeGreaterThan(20);

  // Hyper Rope: hold use to climb ana along the hidden axis, hanging (no falling).
  const rope = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.clearInventory();
    hc.give('hyper_rope');
    hc.select(0);
    hc.setView({ pitch: 60 });
    const H = Array.from(g.player.cam.H);
    const p0 = Array.from(g.player.pos);
    await hc.holdUse(1200);
    const p1 = Array.from(g.player.pos);
    let along = 0;
    for (let k = 0; k < 4; k++) along += (p1[k]! - p0[k]!) * H[k]!;
    return { along, dy: p1[1]! - p0[1]! };
  });
  expect(rope.along).toBeGreaterThan(1.5);
  expect(rope.dy).toBeGreaterThan(-0.5);

  // Ana Pick: breaking one block clears a 3x3 sheet through the neighbouring slices.
  const sheet = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('creative');
    hc.clearInventory();
    hc.give('ana_pick');
    hc.select(0);
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), y = Math.floor(s.pos[1]!) + 1, z = Math.floor(s.pos[2]!) + 3, w = Math.floor(s.pos[3]!);
    for (let dy = -1; dy <= 1; dy++) for (let dw = -1; dw <= 1; dw++) hc.setBlock(x, y + dy, z, w + dw, 'stone');
    hc.setView({ pitch: 0 });
    await hc.frames(3);
    const t = hc.target();
    const ok = hc.breakTarget();
    let left = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dw = -1; dw <= 1; dw++) if (hc.blockAt(x, y + dy, z, w + dw) !== 'air') left++;
    return { aimed: t ? t.z === z : false, ok, left };
  });
  expect(sheet.aimed).toBe(true);
  expect(sheet.ok).toBe(true);
  expect(sheet.left).toBe(0);

  // Crossbow: hold to load, use to shoot a fast bolt.
  const xbow = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.clearInventory();
    hc.give('crossbow');
    hc.give('arrow', 3);
    hc.select(0);
    hc.setView({ pitch: 5 });
    await hc.holdUse(1400);
    const loaded = hc.inventory().filter((s) => s[1] === 'arrow').reduce((a, s) => a + s[2], 0);
    const n0 = hc.arrows().length;
    await hc.frames(3);
    hc.use();
    await hc.frames(3);
    return { arrowsLeft: loaded, shot: hc.arrows().length - n0 };
  });
  expect(xbow.arrowsLeft).toBe(2);
  expect(xbow.shot).toBe(1);

  // Phase Lens (held): a wall one slice ana of yours, where your slice is open, is outlined.
  // Slicer Compass: the HUD reads the slice orientation.
  const lens = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.clearInventory();
    hc.setView({ pitch: 0 });
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    for (let dz = 2; dz <= 3; dz++) for (let dy = 0; dy <= 1; dy++) hc.setBlock(x, y + dy, z + dz, w + 1, 'stone');
    await hc.frames(15);
    const off = hc.lineSegments();
    hc.give('phase_lens');
    hc.select(0);
    await hc.frames(20);
    const on = hc.lineSegments();
    hc.clearInventory();
    hc.give('slicer_compass');
    hc.select(0);
    await hc.frames(20);
    return { off, on, readout: (document.querySelector('.readout') as HTMLElement).textContent };
  });
  expect(lens.on).toBeGreaterThan(lens.off + 20);
  expect(lens.readout).toContain('Hidden axis');
  expect(errors).toEqual([]);
});
