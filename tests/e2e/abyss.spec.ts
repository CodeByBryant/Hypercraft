import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 9.4: the Crystal Abyss. An enclosed geode world lit by crystals alone (the R6 views with and
// without night vision, a tour of its biomes), and the way in: a Resonance Crystal wakes the dormant
// rift of a Geode Gate; the rift leads down to a gate of your own in a chamber carved at your depth,
// and back up.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-9';
const VIEWS = [
  { name: '1-axis-aligned', view: { yaw: 20, pitch: -6 } },
  { name: '2-xw-30', view: { yaw: 20, xw: 30, pitch: -6 } },
  { name: '3-xw45-zw45', view: { yaw: 20, xw: 45, zw: 45, pitch: -6 } },
];
const BIOMES = ['prism_forest', 'geode_hollows', 'resonance_caverns', 'lumen_grotto', 'shard_barrens', 'echo_lakes'];

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

async function nightVision(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v) => void ((window.__hc as unknown as { game: { nightVision: boolean } }).game.nightVision = v), on);
}

async function afterReload(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 120_000 });
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}

test('crystal abyss: R6 views, the dark, and the biomes', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=glowdeep&realm=abyss', errors);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('abyss');
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('spectator');
    hc.setFlying(true);
    hc.setMobSpawning(false);
    hc.clearMobs();
  });
  const start = await page.evaluate(() => window.__hc.state().pos);
  // Sunless: the clock does not matter and there is no sky to see.
  const env = await page.evaluate(() => {
    const e = (window.__hc as unknown as { game: { env: { enclosed: boolean } } }).game.env;
    return { enclosed: e.enclosed };
  });
  expect(env.enclosed).toBe(true);
  for (const v of VIEWS) {
    await page.evaluate(([view, p]) => {
      const hc = window.__hc;
      hc.setView(view as { yaw: number; pitch: number });
      hc.teleport(p[0]!, p[1]! + 2, p[2]!, p[3]!);
    }, [v.view, start] as const);
    await page.evaluate(() => window.__hc.idle(240_000));
    await nightVision(page, true);
    await page.evaluate(() => window.__hc.frames(4));
    await shot(page, `abyss-${v.name}`);
  }
  // The same place with only the crystals for light.
  await nightVision(page, false);
  await page.evaluate(() => window.__hc.frames(4));
  await shot(page, 'abyss-4-no-night-vision');
  // Each biome, found and visited.
  await nightVision(page, true);
  const found: Record<string, boolean> = {};
  for (const b of BIOMES) {
    const p = await page.evaluate((n) => window.__hc.findBiome(n, 3000), b);
    found[b] = p !== null;
    if (!p) continue;
    await page.evaluate((q) => {
      const hc = window.__hc;
      hc.setView({ yaw: 40, pitch: -8 });
      hc.teleport(q[0]!, q[1]! + 3, q[2]!, q[3]!);
    }, p);
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `abyss-biome-${b}`);
  }
  expect(Object.values(found).filter(Boolean).length).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test('geode gate: a resonance crystal wakes the rift, which leads down to your own gate and back up', async ({ page }) => {
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
    hc.setBlock(x, y - 1, z, w, 'gate_stone');
    hc.setBlock(x, y, z, w, 'dormant_abyss_rift');
    hc.setBlock(x, y + 1, z, w, 'dormant_abyss_rift');
    hc.clearInventory();
    // The Hand Mirror does nothing to it; a Resonance Crystal does, and is used up.
    hc.give('hand_mirror');
    hc.select(0);
    await hc.frames(3);
    hc.useOn(x, y, z, w);
    await hc.frames(2);
    const mirror = hc.blockAt(x, y, z, w);
    hc.clearInventory();
    hc.give('resonance_crystal', 2);
    hc.select(0);
    await hc.frames(3);
    hc.useOn(x, y, z, w);
    await hc.frames(2);
    return { x, y, z, w, mirror, after: hc.blockAt(x, y, z, w), after2: hc.blockAt(x, y + 1, z, w), left: hc.inventory().filter((s) => s[1] === 'resonance_crystal').reduce((n, s) => n + s[2], 0) };
  });
  expect(start.mirror).toBe('dormant_abyss_rift');
  expect(start.after).toBe('abyss_rift');
  expect(start.after2).toBe('abyss_rift');
  expect(start.left).toBe(1);

  const loaded = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(([x, y, z, w]) => window.__hc.teleport(x! + 0.5, y!, z! + 0.5, w! + 0.5), [start.x, start.y, start.z, start.w]);
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 0.5, null, { timeout: 60_000 });
  await loaded;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('abyss');
  const there = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state();
    let rift: number[] | null = null;
    for (let dx = -3; dx <= 3 && !rift; dx++)
      for (let dy = -2; dy <= 3 && !rift; dy++)
        for (let dz = -3; dz <= 3 && !rift; dz++)
          if (hc.blockAt(Math.floor(s.pos[0]!) + dx, Math.floor(s.pos[1]!) + dy, Math.floor(s.pos[2]!) + dz, Math.floor(s.pos[3]!)) === 'abyss_rift') rift = [dx, dy, dz];
    return { pos: s.pos, rift };
  });
  // Same x, z, w (the Abyss is not scaled), at about the depth you came from, in a gate of your own.
  expect(Math.abs(there.pos[0]! - (start.x + 0.5))).toBeLessThan(3);
  expect(Math.abs(there.pos[2]! - (start.z + 0.5))).toBeLessThan(3);
  expect(Math.abs(there.pos[1]! - start.y)).toBeLessThan(6);
  expect(there.rift).not.toBeNull();
  await page.evaluate(() => {
    window.__hc.setView({ yaw: 90, pitch: 5 });
  });
  await shot(page, 'abyss-5-arrival-gate');

  const rift = there.rift!;
  const loaded2 = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(([dx, dy, dz]) => {
    const hc = window.__hc;
    const s = hc.state();
    hc.teleport(Math.floor(s.pos[0]!) + dx! + 0.5, Math.floor(s.pos[1]!) + dy!, Math.floor(s.pos[2]!) + dz! + 0.5, Math.floor(s.pos[3]!) + 0.5);
  }, rift);
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 0.5, null, { timeout: 60_000 });
  await loaded2;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('surface');
  const home = await page.evaluate(() => window.__hc.state().pos);
  expect(Math.hypot(home[0]! - (start.x + 0.5), home[2]! - (start.z + 0.5))).toBeLessThan(4);
  expect(errors).toEqual([]);
});

test('abyss mobs: a sound pulse is a shell you see in your slice, and a full prism set turns beams back', async ({ page }) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=glowdeep&realm=abyss', errors);
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.clearInventory();
    // A clear stage around you: stone floor, open air.
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    for (let dx = -10; dx <= 10; dx++)
      for (let dz = -6; dz <= 6; dz++)
        for (let dw = -6; dw <= 6; dw++) {
          hc.setBlock(x + dx, y - 1, z + dz, w + dw, 'stone');
          for (let dy = 0; dy <= 5; dy++) hc.setBlock(x + dx, y + dy, z + dz, w + dw, 'air');
        }
    hc.setView({ yaw: 90, pitch: 0 });
    await hc.frames(4);
  });
  const base = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state();
    return { x: s.pos[0]!, y: s.pos[1]!, z: s.pos[2]!, w: s.pos[3]!, hp: hc.vitals().health };
  });
  // A pulse sung 7 blocks away is a growing ring in the slice; the matching tone cancels it.
  const ring = await page.evaluate(async ([x, y, z, w]) => {
    const hc = window.__hc;
    hc.singPulse(2, x! + 7, y! + 1, z!, w!, 6);
    await hc.frames(6);
    const early = hc.pulses();
    const wrong = hc.cancelPulses(0);
    const right = hc.cancelPulses(2);
    return { early: early.length, r: early[0]?.r ?? 0, wrong, right, left: hc.pulses().length };
  }, [base.x, base.y, base.z, base.w]);
  expect(ring.early).toBe(1);
  expect(ring.r).toBeGreaterThan(0.6);
  expect(ring.wrong).toBe(0);
  expect(ring.right).toBe(1);
  expect(ring.left).toBe(0);
  // Uncancelled: it spreads as sparks on the slice, passes you and hurts once.
  await page.evaluate(([x, y, z, w]) => window.__hc.singPulse(1, x! + 7, y! + 1, z!, w!, 6), [base.x, base.y, base.z, base.w]);
  await page.evaluate(async () => {
    await window.__hc.frames(14);
  });
  await shot(page, 'abyss-6-sound-pulse');
  await page.evaluate(async () => {
    await window.__hc.frames(60);
  });
  const hurt = await page.evaluate(() => window.__hc.vitals().health);
  expect(hurt).toBeLessThan(base.hp);

  // Prism armour: a beam is turned back instead of hurting.
  const beam = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setHealth(20);
    for (let k = 0; k < 4; k++) hc.wear(k, ['prism_helmet', 'prism_chestplate', 'prism_leggings', 'prism_boots'][k]!);
    await hc.frames(3);
    const before = hc.vitals().health;
    hc.shootBeam(5);
    await hc.frames(40);
    return { before, after: hc.vitals().health, done: hc.advancements().done.includes('abyss/beam') };
  });
  expect(beam.after).toBe(beam.before);
  expect(beam.done).toBe(true);
  expect(errors).toEqual([]);
});
