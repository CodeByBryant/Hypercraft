import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 9.6: the Cloud Archipelago. Floating islands over a sea of cloud (the R6 views and a tour of the
// island biomes), light gravity, wind currents along W, and the way in: a Zephyr Feather wakes the
// dormant rift of a Sky Gate.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-9';
const VIEWS = [
  { name: '1-axis-aligned', view: { yaw: 30, pitch: -4 } },
  { name: '2-xw-30', view: { yaw: 30, xw: 30, pitch: -4 } },
  { name: '3-xw45-zw45', view: { yaw: 30, xw: 45, zw: 45, pitch: -4 } },
];
const BIOMES = ['cirrus_meadow', 'storm_reef', 'aurora_ridge', 'zephyr_terraces', 'sunbreak_gardens', 'nimbus_sea'];

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

async function afterReload(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 120_000 });
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}

test('cloud archipelago: R6 views and the island biomes', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=cumulus&realm=cloud', errors);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('cloud');
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('spectator');
    hc.setFlying(true);
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
  });
  const start = await page.evaluate(() => window.__hc.state().pos);
  for (const v of VIEWS) {
    await page.evaluate(
      ([view, p]) => {
        const hc = window.__hc;
        hc.setView(view as { yaw: number; pitch: number });
        hc.teleport(p[0]!, p[1]! + 6, p[2]!, p[3]!);
      },
      [v.view, start] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `cloud-${v.name}`);
  }
  const found: Record<string, boolean> = {};
  for (const b of BIOMES) {
    const p = await page.evaluate((n) => window.__hc.findBiome(n, 3000), b);
    found[b] = p !== null;
    if (!p) continue;
    await page.evaluate((q) => {
      const hc = window.__hc;
      hc.setView({ yaw: 40, pitch: -10 });
      hc.teleport(q[0]!, q[1]! + 5, q[2]!, q[3]!);
    }, p);
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `cloud-biome-${b}`);
  }
  expect(Object.values(found).filter(Boolean).length).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test('cloud: a zephyr feather wakes the sky gate; light gravity; a wind glider rides the current along W', async ({ page }) => {
  test.setTimeout(700_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=lookingglass', errors);
  const start = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    const s = hc.state();
    const x = Math.floor(s.pos[0]!) + 4, y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = 0; dy <= 4; dy++) hc.setBlock(x + dx, y + dy, z + dz, w, 'air');
    hc.setBlock(x, y - 1, z, w, 'sky_gate_stone');
    hc.setBlock(x, y, z, w, 'dormant_cloud_rift');
    hc.setBlock(x, y + 1, z, w, 'dormant_cloud_rift');
    hc.clearInventory();
    hc.give('zephyr_feather', 2);
    hc.select(0);
    await hc.frames(3);
    hc.useOn(x, y, z, w);
    await hc.frames(2);
    return { x, y, z, w, after: hc.blockAt(x, y, z, w), left: hc.inventory().filter((q) => q[1] === 'zephyr_feather').reduce((n, q) => n + q[2], 0) };
  });
  expect(start.after).toBe('cloud_rift');
  expect(start.left).toBe(1);

  const loaded = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(([x, y, z, w]) => window.__hc.teleport(x! + 0.5, y!, z! + 0.5, w! + 0.5), [start.x, start.y, start.z, start.w]);
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 0.5, null, { timeout: 60_000 });
  await loaded;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('cloud');
  const there = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state();
    let rift: number[] | null = null;
    for (let dx = -3; dx <= 3 && !rift; dx++)
      for (let dy = -2; dy <= 3 && !rift; dy++)
        for (let dz = -3; dz <= 3 && !rift; dz++)
          if (hc.blockAt(Math.floor(s.pos[0]!) + dx, Math.floor(s.pos[1]!) + dy, Math.floor(s.pos[2]!) + dz, Math.floor(s.pos[3]!)) === 'cloud_rift') rift = [dx, dy, dz];
    return { pos: s.pos, rift, hud: document.querySelector('.compass-text')?.textContent ?? '' };
  });
  expect(Math.abs(there.pos[0]! - (start.x + 0.5))).toBeLessThan(3);
  expect(there.rift).not.toBeNull();
  expect(there.hud).toContain('wind');
  await page.evaluate(() => window.__hc.setView({ yaw: 90, pitch: 5 }));
  await shot(page, 'cloud-4-arrival-gate');

  // Light gravity: a jump rises about three blocks (1.25 on the Surface).
  const jump = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('creative');
    hc.setFlying(false);
    await hc.frames(40);
    const y0 = hc.state().pos[1]!;
    let max = y0;
    hc.key('Space', true);
    for (let i = 0; i < 120; i++) {
      await hc.frames(1);
      if (i === 2) hc.key('Space', false);
      max = Math.max(max, hc.state().pos[1]!);
    }
    return { y0, rise: max - y0 };
  });
  expect(jump.rise).toBeGreaterThan(2.2);

  // A Wind Glider rides the current: find an altitude where the wind blows hard, fall from it, glide.
  const ride = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.clearInventory();
    hc.wear(1, 'wind_glider');
    const s = hc.state();
    let best = { y: s.pos[1]! + 40, f: 0 };
    for (let y = s.pos[1]! + 30; y < s.pos[1]! + 80; y++) {
      const f = hc.windAt(s.pos[0]!, y, s.pos[2]!);
      if (Math.abs(f) > Math.abs(best.f)) best = { y, f };
    }
    hc.teleport(s.pos[0]!, best.y, s.pos[2]!, s.pos[3]!);
    hc.setView({ yaw: 0, pitch: 0 });
    await hc.frames(20);
    const w0 = hc.state().pos[3]!;
    hc.key('Space', true);
    await hc.frames(2);
    hc.key('Space', false);
    await hc.frames(1);
    const gliding = hc.glide().gliding;
    await hc.frames(60);
    const w1 = hc.state().pos[3]!;
    return { gliding, f: best.f, dw: w1 - w0, wind: hc.wind() };
  });
  expect(Math.abs(ride.f)).toBeGreaterThan(6);
  expect(ride.gliding).toBe(true);
  expect(Math.sign(ride.dw)).toBe(Math.sign(ride.f));
  expect(Math.abs(ride.dw)).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('cloud mobs: a lineup in the sky, and a full cloud set falls slowly and glides without wings', async ({ page }) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=cumulus&realm=cloud', errors);
  const lineup = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.setView({ yaw: 0, pitch: 8 });
    const names = ['storm_kite', 'thunder_hawk', 'wind_sprite', 'cloud_whale'];
    const dist = [5, 6.5, 4, 11];
    const side = [-2.4, 2.2, 0, 4.5];
    const ids = names.map((n, i) => hc.spawnMobAhead(n, dist[i]!, side[i]!));
    await hc.frames(6);
    hc.freezeMobs(true);
    await hc.frames(4);
    return { ids, mobs: hc.mobs().map((m) => m.name), packed: hc.packedMobs() };
  });
  expect(lineup.ids.every((i) => i >= 0)).toBe(true);
  expect(lineup.mobs).toEqual(expect.arrayContaining(['storm_kite', 'thunder_hawk', 'wind_sprite', 'cloud_whale']));
  await shot(page, 'cloud-5-mobs');
  const gear = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.freezeMobs(false);
    hc.clearMobs();
    hc.clearInventory();
    ['cloud_helmet', 'cloud_chestplate', 'cloud_leggings', 'cloud_boots'].forEach((n, k) => hc.wear(k, n));
    const s = hc.state();
    hc.teleport(s.pos[0]!, s.pos[1]! + 40, s.pos[2]!, s.pos[3]!);
    await hc.frames(50);
    const slow = hc.glide().vy;
    hc.key('Space', true);
    await hc.frames(2);
    hc.key('Space', false);
    await hc.frames(2);
    return { slow, gliding: hc.glide().gliding };
  });
  // Slow fall (about -2.2 at most) and, with no wings on, a glide.
  expect(gear.slow).toBeGreaterThan(-2.6);
  expect(gear.gliding).toBe(true);
  expect(errors).toEqual([]);
});

test('storm sovereign: a horn sounded at the beacon wakes it, bolts are announced, a gale shoves you along W, and it falls', async ({ page }) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=cumulus&realm=cloud', errors);
  const set = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.clearInventory();
    hc.setTime(6000);
    const s = hc.state();
    const x = Math.floor(s.pos[0]!) + 4, y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    // A stage: a wide floor, open sky, the Beacon on a pillar.
    for (let dx = -14; dx <= 6; dx++)
      for (let dz = -8; dz <= 8; dz++)
        for (let dw = -24; dw <= 24; dw++) {
          hc.setBlock(x + dx, y - 1, z + dz, w + dw, 'cloud_brick');
          for (let dy = 0; dy <= 16; dy++) hc.setBlock(x + dx, y + dy, z + dz, w + dw, 'air');
        }
    hc.setBlock(x, y, z, w, 'cloud_brick');
    hc.setBlock(x, y + 1, z, w, 'storm_beacon');
    hc.give('storm_horn');
    hc.select(0);
    await hc.frames(4);
    const before = hc.stormBoss();
    hc.useOn(x, y + 1, z, w);
    await hc.frames(10);
    return { x, y, z, w, before, mobs: hc.mobs().map((m) => m.name), after: hc.stormBoss() };
  });
  expect(set.before.id).toBe(-1);
  expect(set.mobs).toContain('storm_sovereign');
  expect(set.after.phase).toBe(1);

  // Bolts: wait for one to be announced, hold everything still, photograph it, then move.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setView({ yaw: 270, pitch: 6 });
    for (let i = 0; i < 4000 && hc.stormBoss().pending === 0; i++) await hc.frames(1);
    await hc.frames(3);
    hc.freezeMobs(true);
    hc.freezeFights(true);
    await hc.frames(6);
  });
  const announced = await page.evaluate(() => window.__hc.stormBoss());
  expect(announced.pending).toBeGreaterThan(0);
  expect(announced.warning).toContain('Lightning');
  await shot(page, 'cloud-6-storm-bolt');
  await page.evaluate(() => {
    window.__hc.freezeMobs(false);
    window.__hc.freezeFights(false);
  });

  // A gale: warned, then it shoves you along W (the sneak grip is tested in the unit and wind tests).
  const gale = await page.evaluate(async (c) => {
    const hc = window.__hc;
    let warned = false;
    for (let i = 0; i < 6000 && hc.stormBoss().galeIn === 0; i++) await hc.frames(1);
    warned = hc.stormBoss().galeIn > 0;
    const dir = hc.stormBoss().galeDir;
    // Stand mid-stage so a wall cannot stop the shove (an earlier gale may have carried you to its edge).
    hc.teleport(c.x - 3 + 0.5, c.y, c.z + 0.5, c.w + 0.5);
    // Wait for it to blow, then give it a couple of seconds.
    // (A gale from just before may still be dying down: wait for one blowing the warned way.)
    const mine = () => Math.sign(hc.wind().now) === dir && Math.abs(hc.wind().now) >= 10;
    for (let i = 0; i < 400 && !mine(); i++) await hc.frames(1);
    const blowing = mine();
    const w1 = hc.state().pos[3]!;
    await hc.frames(150);
    return { warned, dir, blowing, dw: hc.state().pos[3]! - w1 };
  }, { x: set.x, y: set.y, z: set.z, w: set.w });
  expect(gale.warned).toBe(true);
  expect(gale.blowing).toBe(true);
  expect(Math.sign(gale.dw)).toBe(gale.dir);
  expect(Math.abs(gale.dw)).toBeGreaterThan(4);

  const end = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.hurtMob(hc.stormBoss().id, 99999);
    await hc.frames(10);
    return { boss: hc.stormBoss(), adv: hc.advancements().done };
  });
  expect(end.boss.defeated).toBe(true);
  expect(end.adv).toContain('cloud/beacon');
  expect(errors).toEqual([]);
});
