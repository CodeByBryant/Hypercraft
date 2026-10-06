import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 8: the Hollow Void. Light a Void Gate in the Surface and travel there; look around the
// central island under the aurora; ride a Gateway Spire out to a landing island and back; come
// home through the return gate.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-8';

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

test('void gate: six frames, six eyes, a gate and a trip to the Hollow Void', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=voidgate', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    const s = hc.state();
    const x = Math.floor(s.pos[0]!) + 3, y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    // A little chamber: stone floor, the gate cell sunk one below it, a frame on each of its six faces.
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dw = -2; dw <= 2; dw++) {
          hc.setBlock(x + dx, y - 1, z + dz, w + dw, 'stone');
          for (let dy = 0; dy <= 3; dy++) hc.setBlock(x + dx, y + dy, z + dz, w + dw, 'air');
        }
    hc.setBlock(x, y - 2, z, w, 'stone');
    hc.setBlock(x, y - 1, z, w, 'air');
    const faces: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dz, dw] of faces) hc.setBlock(x + dx, y - 1, z + dz, w + dw, 'void_gate_frame');
    hc.clearInventory();
    hc.give('void_eye', 6);
    hc.select(0);
    await hc.frames(3);
    // Held, the eye points at the nearest stronghold like an atlas.
    let atlas = hc.atlas();
    for (let i = 0; i < 400 && !atlas?.target; i++) {
      await hc.frames(2);
      atlas = hc.atlas();
    }
    const found = atlas?.target?.name ?? null;
    const readout = hc.readout();
    const states: string[] = [];
    for (const [dx, dz, dw] of faces) {
      hc.useOn(x + dx, y - 1, z + dz, w + dw);
      await hc.frames(1);
      states.push(hc.blockAt(x, y - 1, z, w));
    }
    const eyes = faces.filter(([dx, dz, dw]) => hc.blockAt(x + dx, y - 1, z + dz, w + dw) === 'void_gate_frame_eye').length;
    return { x, y, z, w, found, readout, states, eyes, left: hc.inventory().length };
  });
  expect(r.found).toBe('stronghold');
  expect(r.readout).toContain('Stronghold');
  // The cell stays dark until the sixth eye goes in, then it lights.
  expect(r.states.slice(0, 5)).toEqual(['air', 'air', 'air', 'air', 'air']);
  expect(r.states[5]).toBe('void_gate');
  expect(r.eyes).toBe(6);
  expect(r.left).toBe(0);

  // Step in: the view swirls, then the game travels to the Hollow Void.
  const loaded = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(([x, y, z, w]) => window.__hc.teleport(x! + 0.5, y! - 1, z! + 0.5, w! + 0.5), [r.x, r.y, r.z, r.w]);
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 0.5, null, { timeout: 60_000 });
  await loaded;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('void');
  const at = await page.evaluate(() => window.__hc.state().pos);
  expect(Math.hypot(at[0]! + 26.5, at[2]! + 29.5, at[3]! - 0.5)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('hollow void: the central island, the aurora, a gateway out and home through the return gate', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=voidtest&realm=void', errors);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('void');
  const info = await page.evaluate(() => {
    const hc = window.__hc;
    return { gate: hc.blockAt(-30, 65, -30, 0), floor: hc.blockAt(-27, 64, -30, 0), pos: hc.state().pos };
  });
  expect(info.gate).toBe('void_gate');
  expect(info.floor).toBe('voidstone_bricks');
  expect(info.pos[1]!).toBeGreaterThan(64);

  // R6: three views of the arrival platform and the central island (the island is a 3-ball:
  // tilting the slice through W changes its outline).
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('spectator');
    hc.setFlying(true);
  });
  const views: [string, { xw?: number; zw?: number }, number][] = [
    ['1-axis-aligned', {}, 6],
    ['2-xw-30', { xw: 30 }, 6],
    ['3-xw45-zw45', { xw: 45, zw: 45 }, 10],
  ];
  for (const [name, v, pitch] of views) {
    await page.evaluate(
      ([vv, pt]) => {
        const hc = window.__hc;
        for (const yaw of [45, -45, 135, -135, 0, 90, 180, -90]) {
          hc.setView({ yaw, pitch: pt as number, ...(vv as object) });
          const f = hc.state().fwd;
          if (f[0]! > 0.4 && f[2]! > 0.4) break;
        }
        hc.teleport(-24, 68, -24, 0.5);
      },
      [v, pitch] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `void-${name}`);
  }

  // The east spire is dormant stone until the Sovereign falls; the arena ring lies inside it.
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('creative');
    hc.setFlying(false);
    hc.travel(41.5, 66, 0.5, 0.5);
  });
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
  const spire = await page.evaluate(() => ({ spire: window.__hc.blockAt(38, 65, 0, 0), ring: window.__hc.blockAt(25, 64, 0, 0), throne: window.__hc.blockAt(0, 64, 0, 0) }));
  expect(spire).toEqual({ spire: 'voidstone', ring: 'sovereign_stone', throne: 'sovereign_stone' });

  // A Gateway Spire (the Sovereign's fall wakes them): standing in the beam carries you out to the landing island.
  await page.evaluate(() => {
    const hc = window.__hc;
    for (let y = 65; y <= 74; y++) hc.setBlock(38, y, 0, 0, 'gateway_beam');
    hc.setView({ yaw: 90, pitch: 0 });
    hc.travel(38.5, 66.5, 0.5, 0.5);
  });
  let out: number[] = [];
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.__hc.frames(5));
    out = await page.evaluate(() => window.__hc.state().pos);
    if (out[0]! > 500) break;
  }
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
  out = await page.evaluate(() => window.__hc.state().pos);
  expect(Math.hypot(out[0]! - 1027.5, out[2]! - 0.5, out[3]! - 0.5)).toBeLessThan(4);
  expect(await page.evaluate(() => window.__hc.blockAt(1024, 73, 0, 0))).toBe('gateway_beam');
  await page.evaluate(() => window.__hc.setMode('spectator'));
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setFlying(true);
    hc.setView({ yaw: -90, pitch: 12 });
    hc.teleport(1033, 82, 0.5, 0.5);
  });
  await page.evaluate(() => window.__hc.idle(240_000));
  await shot(page, 'void-4-landing');

  // ...and the beam there leads home to the central island (after the cooldown).
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('creative');
    hc.setFlying(false);
    hc.travel(1024.5, 74.5, 0.5, 0.5);
  });
  let back: number[] = [];
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.__hc.frames(5));
    back = await page.evaluate(() => window.__hc.state().pos);
    if (back[0]! < 500) break;
  }
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
  back = await page.evaluate(() => window.__hc.state().pos);
  expect(Math.hypot(back[0]! - 41.5, back[2]! - 0.5, back[3]! - 0.5)).toBeLessThan(4);

  // The return gate on the arrival platform leads back to the Surface.
  const home = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(() => window.__hc.travel(-29.5, 65, -29.5, 0.5));
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 0.2, null, { timeout: 60_000 }).catch(() => undefined);
  await home;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('surface');
  expect(errors).toEqual([]);
});
