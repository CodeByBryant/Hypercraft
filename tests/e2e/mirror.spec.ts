import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 9.2: the Mirror Realm. The Surface reflected: W is up (the hidden axis is called Y), the
// sun crosses beneath your feet, left and right swap. A Hand Mirror wakes a dormant rift in a
// Silver Arch; stepping through lands you at your mirror image, in an arch of your own that leads
// home to where you started.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-9';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

/** After a realm trip the page reloads: wait for the new game to settle. */
async function afterReload(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 120_000 });
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}

test('mirror realm: the reflected Surface, W up, the sun below', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await boot(page, 'realm=mirror&res=180&rd=3&seed=lookingglass', errors);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('mirror');
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.setView({ yaw: 0, pitch: 4 });
    await hc.frames(6);
  });
  // "Up is W": the hidden axis is called Y here, and the compass says so.
  const hud = await page.evaluate(() => ({
    labels: [...document.querySelectorAll('.bar-label')].map((e) => e.textContent),
    compass: document.querySelector('.compass-text')?.textContent ?? '',
    sunY: (window.__hc as unknown as { game: { env: { sky: { sunDir: Float64Array; moonDir: Float64Array; stars: number } } } }).game.env.sky.sunDir[1]!,
    moonY: (window.__hc as unknown as { game: { env: { sky: { sunDir: Float64Array; moonDir: Float64Array; stars: number } } } }).game.env.sky.moonDir[1]!,
    mirrored: (window.__hc as unknown as { game: { mirrored: boolean } }).game.mirrored,
  }));
  expect(hud.labels).toEqual(['X', 'Z', 'Y']);
  expect(hud.compass).toContain('h = +Y');
  // Noon: the sun is below the horizon and the moon hangs overhead.
  expect(hud.sunY).toBeLessThan(-0.5);
  expect(hud.moonY).toBeGreaterThan(0.5);
  expect(hud.mirrored).toBe(true);
  await shot(page, 'mirror-1-axis-aligned');
  await page.evaluate(async () => {
    window.__hc.setView({ yaw: 30, pitch: 4, xw: 30 });
    await window.__hc.frames(4);
  });
  await shot(page, 'mirror-2-xw-30');
  await page.evaluate(async () => {
    window.__hc.setView({ yaw: 60, pitch: 6, xw: 45, zw: 45 });
    await window.__hc.frames(4);
  });
  await shot(page, 'mirror-3-xw45-zw45');
  // Ground: the Mirror palette, not the Surface's.
  const ground = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    for (let y = 150; y > 20; y--) {
      const n = hc.blockAt(x, y, z, w);
      if (n !== 'air' && !n.includes('water')) return { y, n };
    }
    return null;
  });
  expect(ground).not.toBeNull();
  expect(['grass_block', 'dirt', 'stone']).not.toContain(ground!.n);
  expect(errors).toEqual([]);
});

test('mirror realm: wake a rift with a hand mirror, cross to your reflection and come home', async ({ page }) => {
  test.setTimeout(600_000);
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
    // A little arch on the test garden's stone: plinth, two rift cells (dormant), room around them.
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = 0; dy <= 4; dy++) hc.setBlock(x + dx, y + dy, z + dz, w, 'air');
    hc.setBlock(x, y - 1, z, w, 'arch_stone');
    hc.setBlock(x, y, z, w, 'dormant_rift');
    hc.setBlock(x, y + 1, z, w, 'dormant_rift');
    hc.clearInventory();
    hc.give('hand_mirror');
    hc.select(0);
    await hc.frames(3);
    const before = hc.blockAt(x, y, z, w);
    hc.useOn(x, y, z, w);
    await hc.frames(2);
    return { x, y, z, w, before, after: hc.blockAt(x, y, z, w), after2: hc.blockAt(x, y + 1, z, w) };
  });
  expect(start.before).toBe('dormant_rift');
  expect(start.after).toBe('mirror_rift');
  expect(start.after2).toBe('mirror_rift');

  // Step in: the view swirls, then the game travels to the Mirror Realm, at the mirror image.
  const loaded = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(([x, y, z, w]) => window.__hc.teleport(x! + 0.5, y!, z! + 0.5, w! + 0.5), [start.x, start.y, start.z, start.w]);
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 0.5, null, { timeout: 60_000 });
  await loaded;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('mirror');
  const there = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state();
    // The arch built for the arrival stands around us: a rift within a few cells.
    let rift: number[] | null = null;
    for (let dx = -3; dx <= 3 && !rift; dx++)
      for (let dy = -2; dy <= 3 && !rift; dy++)
        for (let dz = -3; dz <= 3 && !rift; dz++)
          if (hc.blockAt(Math.floor(s.pos[0]!) + dx, Math.floor(s.pos[1]!) + dy, Math.floor(s.pos[2]!) + dz, Math.floor(s.pos[3]!)) === 'mirror_rift') rift = [dx, dy, dz];
    return { pos: s.pos, rift };
  });
  // x is mirrored (-x - 1 for a cell; our arrival stands one block beside the rift).
  expect(Math.abs(there.pos[0]! - (-(start.x + 0.5) + 1.5))).toBeLessThan(2);
  expect(there.pos[2]!).toBeCloseTo(start.z + 0.5, 0);
  expect(there.rift).not.toBeNull();
  await page.evaluate(() => window.__hc.setView({ yaw: 90, pitch: 5 }));
  await shot(page, 'mirror-4-arrival-arch');

  // And home again: through the arch's own rift, to the Surface, beside the arch we woke.
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
