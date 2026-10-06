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

test('void mobs: a Walker freezes under your gaze and only moves when you look away', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=voidmobs&realm=void', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setHealth(20);
    hc.setView({ yaw: 45, pitch: 0 });
    // Walk away from the platform edge onto open ground first (toward the island's centre).
    hc.teleport(-20, 65.2, -20, 0.5);
    await hc.frames(20);
    const id = hc.spawnMobAhead('void_walker', 14);
    const dist = (): number => {
      const m = hc.mobs().find((x) => x.id === id)!;
      const p = hc.state().pos;
      return Math.hypot(m.pos[0]! - p[0]!, m.pos[2]! - p[2]!, m.pos[3]! - p[3]!);
    };
    await hc.frames(10);
    const d0 = dist();
    await hc.frames(90);
    const watched = dist();
    // Look away: it comes for you.
    hc.setView({ yaw: 45 + 180, pitch: 0 });
    await hc.frames(150);
    const unwatched = dist();
    return { d0, watched, unwatched, alive: !hc.vitals().dead };
  });
  expect(Math.abs(r.watched - r.d0)).toBeLessThan(0.6); // frozen while watched
  expect(r.unwatched).toBeLessThan(r.watched - 3); // moves when you look away
  expect(errors).toEqual([]);

  // R6-style line-up of the four Void mobs for the docs.
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.setView({ yaw: 45, pitch: 8 });
    hc.teleport(-20, 65.2, -20, 0.5);
    hc.spawnMobAhead('void_walker', 9, -3);
    hc.spawnMobAhead('whisper_swarm', 6, 0.5);
    hc.spawnMobAhead('starlight_serpent', 11, 4);
    hc.spawnMobAhead('sky_sentinel', 8, 4);
    hc.freezeMobs(true);
    hc.setMode('spectator');
  });
  await page.evaluate(() => window.__hc.idle(240_000));
  await shot(page, 'void-5-mobs');
});

test('void structures: a Sky Vault with sleeping sentinels that wake when its chest opens, a city and a garden', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=voidvault&realm=void', errors);
  const find = (name: string) => page.evaluate((n) => window.__hc.locate([n], 2500), name);
  const vault = await find('sky_vault');
  const city = await find('void_city');
  const garden = await find('starlight_garden');
  expect(vault && city && garden).toBeTruthy();

  /** Fly to a structure and look at its centre from `dist` blocks back along +x (spectator). */
  async function visit(p: { x: number; y: number; z: number; w: number }, dist: number, pitch: number, name: string, extra: { xw?: number; zw?: number } = {}): Promise<void> {
    await page.evaluate(
      ([pp, d, pt, ex]) => {
        const hc = window.__hc;
        const c = pp as { x: number; y: number; z: number; w: number };
        hc.setMode('spectator');
        hc.setFlying(true);
        for (const yaw of [90, -90, 0, 180]) {
          hc.setView({ yaw, pitch: pt as number, ...(ex as object) });
          if (hc.state().fwd[0]! > 0.6) break;
        }
        const f = hc.state().fwd;
        hc.travel(c.x + 0.5 - f[0]! * (d as number), c.y + 3 - f[1]! * (d as number), c.z + 0.5 - f[2]! * (d as number), c.w + 0.5 - f[3]! * (d as number));
      },
      [p, dist, pitch, extra] as const,
    );
    await page.evaluate(() => window.__hc.ready(180_000));
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, name);
  }

  await visit(vault!, 16, -6, 'void-6-sky-vault');
  await visit(vault!, 16, -6, 'void-6b-sky-vault-xw30', { xw: 30 });
  // The guards: asleep until a chest in the vault is opened.
  const guards = await page.evaluate(() => window.__hc.mobs().filter((m) => m.name === 'sky_sentinel'));
  expect(guards.length).toBeGreaterThanOrEqual(2);
  for (const g of guards) expect(g.awake).toBe(false);
  // Find the vault's chest (the orientation of the structure is random) and open it.
  const woke = await page.evaluate(
    async ([vx, vy, vz, vw]) => {
      const hc = window.__hc;
      hc.setMode('survival');
      hc.setFlying(false);
      hc.setMobSpawning(false);
      let chest: number[] | null = null;
      for (let dw = -6; dw <= 6 && !chest; dw++)
        for (let dz = -6; dz <= 6 && !chest; dz++)
          for (let dx = -6; dx <= 6 && !chest; dx++)
            for (let dy = 0; dy <= 4 && !chest; dy++) if (hc.blockAt(vx! + dx, vy! + dy, vz! + dz, vw! + dw) === 'chest') chest = [vx! + dx, vy! + dy, vz! + dz, vw! + dw];
      if (!chest) return { chest: null, awake: 0 };
      hc.travel(chest[0]! + 0.5, chest[1]! + 1, chest[2]! + 0.5, chest[3]! + 0.5);
      await hc.ready(180_000);
      hc.clearInventory();
      hc.useOn(chest[0]!, chest[1]!, chest[2]!, chest[3]!);
      await hc.frames(3);
      const open = hc.screenOpen();
      hc.closeScreen();
      return { chest, awake: hc.mobs().filter((m) => m.name === 'sky_sentinel' && m.awake).length, open };
    },
    [vault!.x, vault!.y, vault!.z, vault!.w],
  );
  expect(woke.chest).not.toBeNull();
  expect(woke.awake).toBeGreaterThanOrEqual(2);

  await visit(city!, 22, -8, 'void-7-void-city');
  await visit(city!, 22, -8, 'void-7b-void-city-xw45zw45', { xw: 45, zw: 45 });
  await visit(garden!, 14, -8, 'void-8-starlight-garden');
  expect(errors).toEqual([]);
});

test('void sovereign: it wakes in the arena, the arena is locked, pylons break, it phase-shifts, falls and opens the gateways', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=voidboss&realm=void', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setHealth(20);
    hc.setView({ yaw: 45, pitch: -60 });
    // Walk to the arena's edge: close enough for the Sovereign to wake.
    hc.teleport(-14.5, 65.1, -14.5, 0.5);
    await hc.frames(30);
    const woke = hc.boss();
    // The arena stone does not yield while it lives (survival), and you cannot build in it.
    hc.give('stone', 8);
    hc.select(0);
    const broke = hc.breakTarget();
    const placed = hc.placeTarget('stone');
    // Its pylons do: break one with the pick (any block of it).
    const before = hc.voidBoss().pylons;
    const harvested = hc.harvestAt(22, 67, 0, 0);
    await hc.frames(15);
    const after = hc.voidBoss().pylons;
    return { woke: woke && { name: woke.name, health: woke.health, max: woke.max }, broke, placed, before, harvested, after };
  });
  expect(r.woke).toEqual({ name: 'void_sovereign', health: 600, max: 600 });
  expect(r.broke).toBe(false);
  expect(r.placed).toBe(false);
  expect(r.before).toBe(8);
  expect(r.harvested).toBe(true);
  expect(r.after).toBe(7);

  // A screenshot of the fight: the Sovereign over its throne, pylons around.
  await page.evaluate(() => {
    const hc = window.__hc;
    const bid = hc.boss()!.id;
    const b = hc.mobs().find((x) => x.id === bid)!;
    hc.freezeMobs(true);
    hc.setMode('spectator');
    hc.setFlying(true);
    hc.setView({ yaw: 45, pitch: 8 });
    const f = hc.state().fwd;
    hc.teleport(b.pos[0]! - f[0]! * 15, 68, b.pos[2]! - f[2]! * 15, b.pos[3]! - f[3]! * 15);
  });
  await page.evaluate(() => window.__hc.idle(240_000));
  await shot(page, 'void-9-sovereign');

  // Phase II: hurt it below two thirds; before long it slips off the slice and cannot be hurt.
  const shifted = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.freezeMobs(false);
    hc.setMode('survival');
    hc.setHealth(20);
    hc.teleport(-14.5, 65.1, -14.5, 0.5);
    const id = hc.boss()!.id;
    hc.hurtMob(id, 230); // 600 -> 370
    let seen = false, untouchable = false, warning = '';
    for (let i = 0; i < 2400 && !seen; i++) {
      await hc.frames(1);
      hc.setHealth(20);
      const v = hc.voidBoss();
      if (v.shifted) {
        seen = true;
        warning = v.warning;
        untouchable = !hc.hurtMob(id, 50);
      }
    }
    return { seen, untouchable, warning, phase: hc.voidBoss().phase };
  });
  expect(shifted.seen).toBe(true);
  expect(shifted.untouchable).toBe(true);
  expect(shifted.phase).toBeGreaterThanOrEqual(2);
  expect(shifted.warning).toMatch(/kata|ana/);

  // Defeat: the gate on the throne, the spires, the memory.
  const done = await page.evaluate(async () => {
    const hc = window.__hc;
    const id = hc.boss()!.id;
    // (While it is phase-shifted nothing touches it: keep trying until it steps back into the slice.)
    for (let k = 0; k < 900 && hc.boss(); k++) {
      hc.setHealth(20);
      hc.hurtMob(id, 1e6);
      await hc.frames(3);
    }
    await hc.frames(40);
    const g = (window.__hc as unknown as { game: { snapshot(): { data?: { voidSovereign?: { defeated: boolean } } } } }).game;
    const first = { boss: hc.boss(), v: hc.voidBoss(), gate: hc.blockAt(0, 65, 0, 0), frame: hc.blockAt(1, 65, 0, 0) };
    // The spires wake as their columns come into reach: walk over to the eastern one.
    hc.travel(30, 66, 3, 0.5);
    await hc.ready(180_000);
    await hc.idle(240_000);
    await hc.frames(90);
    // With the Sovereign gone the arena is just ground again: survival can break it.
    hc.setMode('survival');
    hc.give('stone', 4);
    hc.select(0);
    hc.setView({ yaw: 45, pitch: -60 });
    await hc.frames(5);
    const broke = hc.breakTarget();
    return {
      broke,
      boss: first.boss,
      v: first.v,
      gate: first.gate,
      frame: first.frame,
      spire: hc.blockAt(38, 66, 0, 0),
      saved: g.snapshot().data?.voidSovereign?.defeated ?? null,
    };
  });
  expect(done.boss).toBeNull();
  expect(done.v.defeated).toBe(true);
  expect(done.gate).toBe('void_gate');
  expect(done.frame).toBe('void_gate_frame_eye');
  expect(done.spire).toBe('gateway_beam');
  expect(done.saved).toBe(true);
  expect(done.broke).toBe(true); // the arena is just ground again
  expect(errors).toEqual([]);
});
