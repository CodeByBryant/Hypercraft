import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from './util';

// Phase 6: a 4D portal. Build an obsidian hyper-frame (the boundary of a 2 x 3 x 2 box in a
// vertical hyperplane), light it, walk in, arrive in the Ember Depths at 1/8 of the x, z and w
// coordinates next to a freshly built twin portal, and come back.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-6';

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

/**
 * Look at point `c` from `dist` blocks back along a view whose forward is roughly +x: the eye
 * goes on the line through `c` along the view direction, so `c` is in the slice even when the
 * slice is tilted through W.
 */
async function lookAt(page: Page, c: number[], dist: number, pitch: number, extra: { xw?: number; zw?: number } = {}): Promise<void> {
  await page.evaluate(
    ([cc, d, pt, ex]) => {
      const hc = window.__hc;
      for (const yaw of [90, -90, 0, 180]) {
        hc.setView({ yaw, pitch: pt as number, ...(ex as object) });
        if (hc.state().fwd[0]! > 0.6) break;
      }
      const s = hc.state();
      const f = s.fwd, c4 = cc as number[];
      const eyeUp = s.eye[1]! - s.pos[1]!;
      hc.teleport(c4[0]! - f[0]! * (d as number), c4[1]! - f[1]! * (d as number) - eyeUp, c4[2]! - f[2]! * (d as number), c4[3]! - f[3]! * (d as number));
    },
    [c, dist, pitch, extra] as const,
  );
}

/** A yaw (degrees) whose forward direction is +x. */
async function faceX(page: Page, pitch: number, extra: { xw?: number; zw?: number } = {}): Promise<void> {
  await page.evaluate(
    ([pt, ex]) => {
      const hc = window.__hc;
      for (const yaw of [90, -90, 0, 180]) {
        hc.setView({ yaw, pitch: pt as number, ...(ex as object) });
        if (hc.state().fwd[0]! > 0.6) return;
      }
    },
    [pitch, extra] as const,
  );
}

test('portals: light a 4D frame, travel 8:1 to the Ember Depths and back', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=portals', errors);
  const report: Record<string, unknown> = {};
  const p = await page.evaluate(() => window.__hc.state().pos);
  // The frame: normal along x (walk through it along x), interior 2 x 3 x 2 in (z, y, w).
  const bx = Math.floor(p[0]!) + 4, by = Math.floor(p[1]!), bz = Math.floor(p[2]!) - 1, bw = Math.floor(p[3]!) - 1;
  const box = await page.evaluate(([x, y, z, w]) => window.__hc.buildPortalFrame(x!, y!, z!, w!, 0), [bx, by, bz, bw]);
  expect(box.min).toEqual([bx, by, bz, bw]);
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.lightPortal(x!, y! + 1, z!, w!), [bx, by, bz, bw])).toBe(true);
  const membrane = await page.evaluate(([x, y, z, w]) => {
    const hc = window.__hc;
    let n = 0;
    for (let dy = 0; dy < 3; dy++) for (let dz = 0; dz < 2; dz++) for (let dw = 0; dw < 2; dw++) if (hc.blockAt(x!, y! + dy, z! + dz, w! + dw) === 'portal') n++;
    return n;
  }, [bx, by, bz, bw]);
  expect(membrane).toBe(12);

  // R6: the lit portal in three views (its cross-section changes as the slice tilts).
  const views: [string, { xw?: number; zw?: number }][] = [
    ['1-axis-aligned', {}],
    ['2-xw-30', { xw: 30 }],
    ['3-xw45-zw45', { xw: 45, zw: 45 }],
  ];
  const center = [bx + 0.5, by + 1.5, bz + 1, bw + 1];
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setFlying(true);
    hc.setMode('spectator');
  });
  for (const [name, v] of views) {
    await lookAt(page, center, 6, -6, v);
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `portal-${name}`);
  }
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('creative');
    hc.setFlying(false);
  });

  // Walk in: the view swirls, and after 4 s (survival) we travel.
  await faceX(page, 0);
  await page.evaluate(() => window.__hc.setMode('survival'));
  const loaded = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(([x, y, z, w]) => window.__hc.teleport(x! + 0.5, y! + 0.01, z! + 1, w! + 1), [bx, by, bz, bw]);
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 1.5, null, { timeout: 60_000 });
  await shot(page, 'portal-swirl');
  await loaded;
  await afterReload(page);

  expect(await page.evaluate(() => window.__hc.realm())).toBe('ember');
  const e = await page.evaluate(() => window.__hc.state().pos);
  const target = [(bx + 0.5) / 8, by, (bz + 1) / 8, (bw + 1) / 8];
  report.surfacePortal = [bx, by, bz, bw];
  report.emberArrival = e;
  report.expected = target;
  // 8:1 in x, z and w: the arrival portal is within a few blocks of the scaled point.
  expect(Math.abs(e[0]! - target[0]!)).toBeLessThan(10);
  expect(Math.abs(e[2]! - target[2]!)).toBeLessThan(10);
  expect(Math.abs(e[3]! - target[3]!)).toBeLessThan(10);
  const inPortal = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state().pos;
    return hc.blockAt(Math.floor(s[0]!), Math.floor(s[1]! + 0.2), Math.floor(s[2]!), Math.floor(s[3]!));
  });
  expect(inPortal).toBe('portal');
  const portals = await page.evaluate(() => window.__hc.portals());
  report.portals = portals;
  expect(portals.some((r) => r.realm === 'surface')).toBe(true);
  expect(portals.some((r) => r.realm === 'ember')).toBe(true);
  // The arrival portal in the Ember Depths, seen from 6 blocks in front of it.
  const arrival = portals.find((r) => r.realm === 'ember')!;
  const ac = [(arrival.min[0]! + arrival.max[0]! + 1) / 2, arrival.min[1]! + 1.5, (arrival.min[2]! + arrival.max[2]! + 1) / 2, (arrival.min[3]! + arrival.max[3]! + 1) / 2];
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setFlying(true);
    hc.setMode('spectator');
  });
  for (const [name, v] of views) {
    await lookAt(page, ac, 6, -6, v);
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `ember-arrival-${name}`);
  }
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setFlying(false);
  });

  // Water boils away in the Ember Depths.
  const water = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.clearInventory();
    hc.give('water_bucket', 1);
    hc.select(0);
    hc.setView({ pitch: -70 });
    await hc.frames(2);
    hc.use();
    await hc.frames(4);
    return hc.inventory().map((s) => s[1]);
  });
  expect(water).toEqual(['bucket']);

  // Back to the Surface: step out of the portal along its normal, then back in.
  const back = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(async () => {
    const hc = window.__hc;
    const r = hc.portals().find((q) => q.realm === 'ember')!;
    const cx = (r.min[0]! + r.max[0]! + 1) / 2, cz = (r.min[2]! + r.max[2]! + 1) / 2, cw = (r.min[3]! + r.max[3]! + 1) / 2;
    const out = [cx, r.min[1]!, cz, cw];
    out[r.axis] = out[r.axis]! + 1.5;
    hc.teleport(out[0]!, out[1]! + 0.01, out[2]!, out[3]!);
    await hc.frames(6);
    hc.teleport(cx, r.min[1]! + 0.01, cz, cw);
  });
  await back;
  await afterReload(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('surface');
  const s = await page.evaluate(() => window.__hc.state().pos);
  report.surfaceReturn = s;
  // Back within reach of the original portal (8 x the Ember offset, plus the arrival search).
  expect(Math.hypot(s[0]! - bx, s[2]! - bz, s[3]! - bw)).toBeLessThan(96);

  mkdirSync(dir(), { recursive: true });
  writeFileSync(`${dir()}/portal.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});

/** A saved world (IndexedDB) after a page load: dismiss the start menu and wait for terrain. */
async function resumeSaved(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}

test('a flat Minecraft-style portal in a saved world: flint and steel, the trip, and back', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('hypercraft.settings.v1', JSON.stringify({ resolution: 180, renderDistance: 2, touch: 'off' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Singleplayer' }).click();
  await page.getByRole('button', { name: 'Create new world' }).click();
  await page.locator('label:has-text("World name") input').fill('Portal World');
  await page.locator('label:has-text("Seed") input[type=text]').fill('flat portal');
  await page.getByRole('button', { name: 'Create world' }).click();
  await page.waitForURL(/\?world=/);
  await resumeSaved(page);

  // A 4 x 5 obsidian frame with corners, in the x-y plane of the slice (wide along x, so you
  // walk through it along z), standing on the ground in front of us.
  const frame = await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('survival');
    const s = hc.state();
    const x = Math.floor(s.pos[0]!) + 2, z = Math.floor(s.pos[2]!) + 2, w = Math.floor(s.pos[3]!);
    const y = Math.max(hc.skyHeight(x, z, w), hc.skyHeight(x + 1, z, w)) + 2;
    return hc.buildPortalFrame(x, y, z, w, 2, 'obsidian', 3);
  });
  const [x0, y0, z0, w0] = frame.min as [number, number, number, number];
  expect(frame.thin).toBe(3);

  // Stand inside the frame and light its floor with flint and steel, like in Minecraft.
  const lit = await page.evaluate(
    async ([x, y, z, w]) => {
      const hc = window.__hc;
      hc.clearInventory();
      hc.give('flint_and_steel', 1);
      hc.select(0);
      hc.teleport(x! + 0.5, y! + 0.01, z! + 0.5, w! + 0.5);
      hc.setView({ pitch: -89 });
      await hc.frames(3);
      const t = hc.target();
      hc.use();
      await hc.frames(3);
      let n = 0;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++) if (hc.blockAt(x! + dx, y! + dy, z!, w!) === 'portal') n++;
      return { target: t?.name, membrane: n, durability: hc.inventory()[0]?.[3] ?? -1 };
    },
    [x0, y0, z0, w0],
  );
  expect(lit.target).toBe('obsidian');
  expect(lit.membrane).toBe(6);
  expect(lit.durability).toBe(1);

  // Standing in it for 4 s (survival) saves the world and reloads into the Ember Depths.
  const loaded = page.waitForEvent('load', { timeout: 180_000 });
  await page.waitForFunction(() => (window.__hc?.portalTime?.() ?? 0) > 1, null, { timeout: 60_000 });
  await loaded;
  await resumeSaved(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('ember');
  const arrival = await page.evaluate(() => {
    const hc = window.__hc;
    const s = hc.state().pos;
    return {
      block: hc.blockAt(Math.floor(s[0]!), Math.floor(s[1]! + 0.2), Math.floor(s[2]!), Math.floor(s[3]!)),
      portal: hc.portals().find((r) => r.realm === 'ember') ?? null,
    };
  });
  expect(arrival.block).toBe('portal');
  // The arrival portal copies the shape: flat, wide along x.
  expect(arrival.portal!.thin).toBe(3);
  expect(arrival.portal!.axis).toBe(2);

  // Back through it: step out along the normal (z), then in again.
  const back = page.waitForEvent('load', { timeout: 180_000 });
  await page.evaluate(async () => {
    const hc = window.__hc;
    const r = hc.portals().find((q) => q.realm === 'ember')!;
    const cx = (r.min[0]! + r.max[0]! + 1) / 2, cz = r.min[2]! + 0.5, cw = r.min[3]! + 0.5;
    hc.teleport(cx, r.min[1]! + 0.01, cz - 1.5, cw);
    await hc.frames(6);
    hc.teleport(cx, r.min[1]! + 0.01, cz, cw);
  });
  await back;
  await resumeSaved(page);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('surface');
  // The Surface portal was saved with the world: we are back in it, and it is still lit.
  const home = await page.evaluate(
    ([x, y, z, w]) => {
      const hc = window.__hc;
      const s = hc.state().pos;
      return { membrane: hc.blockAt(x!, y!, z!, w!), dist: Math.hypot(s[0]! - x!, s[2]! - z!, s[3]! - w!) };
    },
    [x0, y0, z0, w0],
  );
  expect(home.membrane).toBe('portal');
  expect(home.dist).toBeLessThan(4);
  expect(errors).toEqual([]);
});
