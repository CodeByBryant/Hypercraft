import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from './util';

// Phase 5: a village found through the data-driven structure grid (roads, beds, villagers) in
// the three R6 views, trading with a villager through the trade screen, a dungeon's spawner and
// loot chests, sleeping through the night in a bed (and the monsters-nearby refusal), and the
// atlas readout that points at the nearest structure.

const VILLAGES = ['village_meadow', 'village_orchard', 'village_marsh', 'village_taiga', 'village_snow', 'village_savanna', 'village_desert'];

const VIEWS = [
  { name: '1-axis-aligned', view: { yaw: 35, pitch: -28 } },
  { name: '2-xw-30', view: { yaw: 35, xw: 30, pitch: -28 } },
  { name: '3-xw45-zw45', view: { yaw: 35, xw: 45, zw: 45, pitch: -28 } },
];

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-5';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

/** Teleport far away and wait until the destination has streamed in and settled. */
async function travel(page: Page, x: number, y: number, z: number, w: number): Promise<void> {
  await page.evaluate(([a, b, c, d]) => window.__hc.travel(a!, b!, c!, d!), [x, y, z, w]);
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}

test('structures: village, villagers, trading, dungeon, beds and atlas', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=villages', errors);
  const report: Record<string, unknown> = {};
  const count = async (name: string) => (await page.evaluate(() => window.__hc.inventory())).filter((s) => s[1] === name).reduce((a, s) => a + s[2], 0);

  // ---- Find a village with the structure grid (data-driven: every name is in STRUCTURES).
  const names = await page.evaluate(() => window.__hc.structureNames());
  for (const v of VILLAGES) expect(names).toContain(v);
  const village = await page.evaluate((v) => window.__hc.locate(v, 3000), VILLAGES);
  expect(village).not.toBeNull();
  report.village = village;
  // Stand on the plaza, next to the well.
  await travel(page, village!.x + 4.5, village!.y + 2, village!.z + 0.5, village!.w + 0.5);

  // Roads and beds are really in the world (the plaza is a path ball of radius 5).
  const blocks = await page.evaluate(([x0, y0, z0, w0]) => {
    const hc = window.__hc;
    const n: Record<string, number> = {};
    for (let w = w0! - 3; w <= w0! + 3; w++)
      for (let z = z0! - 8; z <= z0! + 8; z++)
        for (let y = y0! - 6; y <= y0! + 6; y++)
          for (let x = x0! - 8; x <= x0! + 8; x++) {
            const b = hc.blockAt(x, y, z, w);
            n[b] = (n[b] ?? 0) + 1;
          }
    return n;
  }, [village!.x, village!.y, village!.z, village!.w]);
  const paths = (blocks.dirt_path ?? 0) + (village!.name === 'village_desert' ? (blocks.sandstone ?? 0) : 0);
  report.plazaPathBlocks = paths;
  expect(paths).toBeGreaterThan(30);

  // Villagers spawned from the structure's markers as their columns loaded.
  await page.evaluate(() => window.__hc.frames(10));
  const villagers = await page.evaluate(() => window.__hc.villagers());
  report.villagers = villagers.map((v) => `${v.name}${v.profession ? ` (${v.profession})` : ''}`);
  expect(villagers.length).toBeGreaterThan(0);

  // ---- R6: the village in three views, from above the plaza.
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.freezeMobs(true);
    hc.setTime(2500);
    hc.setMode('spectator');
    hc.setFlying(true);
  });
  const st = await page.evaluate(() => window.__hc.state());
  for (const v of VIEWS) {
    // Look at the plaza from 26 blocks back along the view direction (up and away); if a
    // hill is in the way, go up until the crosshair ray reaches the village.
    await page.evaluate(
      ([view, p]) => {
        const hc = window.__hc;
        hc.setView(view as { yaw: number; pitch: number });
        const f = hc.state().fwd;
        hc.teleport(p[0]! - f[0]! * 26, p[1]! + 1.6 - f[1]! * 26, p[2]! - f[2]! * 26, p[3]! - f[3]! * 26);
      },
      [v.view, st.pos] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    for (let up = 0; up < 8; up++) {
      const clear = await page.evaluate(() => {
        const d = window.__hc.rayDist(48);
        return d < 0 || d > 18;
      });
      if (clear) break;
      await page.evaluate(() => {
        const hc = window.__hc;
        const s = hc.state().pos;
        hc.teleport(s[0]!, s[1]! + 5, s[2]!, s[3]!);
      });
      await page.evaluate(() => window.__hc.idle(240_000));
    }
    await shot(page, `village-${v.name}`);
  }
  await page.evaluate((p) => {
    const hc = window.__hc;
    hc.setView({ yaw: 0, pitch: -10 });
    hc.teleport(p[0]!, p[1]!, p[2]!, p[3]!);
    hc.setFlying(false);
    hc.setMode('survival');
  }, st.pos);

  // ---- Trading: talk to a villager with a profession, pay the first offer, get the result.
  const trader = villagers.find((v) => v.profession && v.profession !== 'none');
  expect(trader).toBeDefined();
  // Bring the villager next to the player so the trade screen stays open.
  await page.evaluate((id) => window.__hc.placeMobAhead(id, 2), trader!.id);
  expect(await page.evaluate((id) => window.__hc.talk(id), trader!.id)).toBe(true);
  await page.waitForSelector('.trade-offer');
  const offers = await page.evaluate(() => window.__hc.villagers());
  const me = offers.find((v) => v.id === trader!.id)!;
  expect(me.offers.length).toBeGreaterThanOrEqual(2);
  const offer = me.offers[0]!;
  // Pay for it (twice the base price covers any reputation or demand markup).
  await page.evaluate((cost) => {
    for (const [n, c] of cost) window.__hc.give(n, c * 2);
  }, offer.cost);
  // Re-render the screen so the offer shows as affordable, then click it.
  await page.evaluate((id) => {
    window.__hc.closeScreen();
    window.__hc.talk(id);
  }, trader!.id);
  await page.waitForSelector('.trade-offer.can');
  await shot(page, 'trade-screen');
  const before = await count(offer.result[0]);
  await page.click('.trade-offer.can >> nth=0');
  await expect.poll(() => count(offer.result[0])).toBe(before + offer.result[1]);
  const after = await page.evaluate(() => window.__hc.villagers());
  expect(after.find((v) => v.id === trader!.id)!.offers[0]!.uses).toBe(1);
  report.trade = { villager: trader!.name, cost: offer.cost, result: offer.result };
  await page.evaluate(() => window.__hc.closeScreen());

  // ---- Beds: sleep through the night; a monster nearby stops you; beds set the respawn point.
  // Place a bed from the item, looking down at the plaza: the foot goes where you click and
  // the head one cell further along your facing (beds are two cells long).
  const ground = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.clearInventory();
    hc.give('red_bed', 1);
    hc.select(0);
    hc.setView({ yaw: 0, pitch: -55 });
    // A plank floor ahead of the player (the plaza may be a bridge over marsh water), with
    // two cells of head room above it.
    const s = hc.state();
    const f = s.fwd;
    let ax = 0;
    for (const k of [2, 3]) if (Math.abs(f[k]!) > Math.abs(f[ax]!)) ax = k;
    const g = Math.floor(s.pos[1]! - 0.01);
    for (let i = 0; i <= 3; i++) {
      const c = [Math.floor(s.pos[0]!), g, Math.floor(s.pos[2]!), Math.floor(s.pos[3]!)];
      c[ax] = c[ax]! + i * Math.sign(f[ax]!);
      if (i > 0) hc.setBlock(c[0]!, g, c[2]!, c[3]!, 'planks');
      for (let h = 1; h <= 2; h++) hc.setBlock(c[0]!, g + h, c[2]!, c[3]!, 'air');
    }
    await hc.frames(3);
    const t = hc.target();
    if (!t) throw new Error(`no target below ${JSON.stringify(s.pos)}`);
    return { t: [t.x, t.y, t.z, t.w], ax, sign: Math.sign(f[ax]!) };
  });
  await page.evaluate(() => window.__hc.use());
  await page.evaluate(() => window.__hc.frames(4));
  const bedPos = [ground.t[0]!, ground.t[1]! + 1, ground.t[2]!, ground.t[3]!] as [number, number, number, number];
  const headPos = [...bedPos] as [number, number, number, number];
  headPos[ground.ax] += ground.sign;
  expect(await page.evaluate((b) => window.__hc.blockAt(b[0]!, b[1]!, b[2]!, b[3]!), bedPos)).toBe('red_bed');
  expect(await page.evaluate((b) => window.__hc.blockAt(b[0]!, b[1]!, b[2]!, b[3]!), headPos)).toBe('red_bed_head');
  expect(await count('red_bed')).toBe(0); // placing used the item
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setView({ yaw: 0, pitch: -35 });
  });
  await page.evaluate(() => window.__hc.idle(240_000));
  await shot(page, 'bed');
  // Daytime: no sleep, but the respawn point is set.
  await page.evaluate(() => window.__hc.setTime(6000));
  expect(await page.evaluate((b) => window.__hc.useBed(b[0]!, b[1]!, b[2]!, b[3]!), bedPos)).toBe(false);
  expect(await page.evaluate(() => window.__hc.bed())).toEqual(bedPos);
  // Night with a Shambler 3 blocks kata of the bed: refused, and the message says where it is.
  await page.evaluate((b) => {
    const hc = window.__hc;
    hc.setTime(18000);
    hc.spawnMob('shambler', b[0]! + 0.5, b[1]!, b[2]! + 0.5, b[3]! - 2.5);
  }, bedPos);
  expect(await page.evaluate((b) => window.__hc.useBed(b[0]!, b[1]!, b[2]!, b[3]!), bedPos)).toBe(false);
  const refusal = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
  expect(refusal).toContain('You may not rest now');
  report.bedRefusal = refusal;
  // The head half works too (the respawn point stays the foot).
  expect(await page.evaluate((b) => window.__hc.useBed(b[0]!, b[1]!, b[2]!, b[3]!), headPos)).toBe(false);
  expect(await page.evaluate(() => window.__hc.bed())).toEqual(bedPos);
  // Without the monster: sleep, the screen fades, and it is morning of the next day.
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.freezeMobs(false);
  });
  const night = await page.evaluate(() => window.__hc.time());
  expect(await page.evaluate((b) => window.__hc.useBed(b[0]!, b[1]!, b[2]!, b[3]!), bedPos)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__hc.sleeping()?.t ?? 0)).toBeGreaterThan(1.2);
  await shot(page, 'sleeping');
  await expect.poll(() => page.evaluate(() => window.__hc.sleeping()), { timeout: 20_000 }).toBeNull();
  const morning = await page.evaluate(() => window.__hc.time());
  expect(morning.day).toBe(night.day + 1);
  expect(morning.timeOfDay).toBeLessThan(1000);
  report.sleep = { night, morning };
  // Dying brings you back to the bed.
  await page.evaluate(() => window.__hc.hurt(100, 'Test'));
  await expect(page.locator('.menu-card.death')).toBeVisible();
  await page.click('.menu-card.death button.primary');
  await page.evaluate(() => window.__hc.ready(120_000));
  const back = await page.evaluate(() => window.__hc.state().pos);
  expect(Math.abs(back[0]! - (bedPos[0] + 0.5))).toBeLessThan(1.5);
  expect(Math.abs(back[3]! - (bedPos[3] + 0.5))).toBeLessThan(1.5);
  // Breaking the head removes the whole bed and drops one bed item.
  const broke = await page.evaluate(([h, f]) => {
    const hc = window.__hc;
    const before = hc.dropped().filter((d) => d[0] === 'red_bed').length;
    const ok = hc.harvestAt(h[0]!, h[1]!, h[2]!, h[3]!);
    return { ok, head: hc.blockAt(h[0]!, h[1]!, h[2]!, h[3]!), foot: hc.blockAt(f[0]!, f[1]!, f[2]!, f[3]!), beds: hc.dropped().filter((d) => d[0] === 'red_bed').length - before };
  }, [headPos, bedPos]);
  expect(broke).toEqual({ ok: true, head: 'air', foot: 'air', beds: 1 });

  // ---- Atlas: hold a Ruins Atlas; the readout points at the nearest ruin (worker search).
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.clearInventory();
    hc.give('ruins_atlas', 1);
    hc.select(0);
  });
  await expect.poll(() => page.evaluate(() => window.__hc.atlas()?.item ?? ''), { timeout: 60_000 }).toBe('ruins_atlas');
  // "🗺 Dungeon ↗ 40 m (3 m ana)": the name, a direction in the slice, the distance, kata/ana.
  await expect.poll(() => page.evaluate(() => window.__hc.readout()), { timeout: 10_000 }).toMatch(/^🗺 .+ \d+ m {2}\((in this slice|\d+ m (kata|ana))\)$/);
  const readout = await page.evaluate(() => window.__hc.readout());
  report.atlas = { target: await page.evaluate(() => window.__hc.atlas()?.target ?? null), readout };

  // ---- Dungeon: a spawner with a block entity, and chests full of loot.
  const dungeon = await page.evaluate(() => window.__hc.locate(['dungeon'], 3000));
  expect(dungeon).not.toBeNull();
  report.dungeon = dungeon;
  await page.evaluate(() => window.__hc.setMode('spectator'));
  await travel(page, dungeon!.x + 1.5, dungeon!.y + 1.05, dungeon!.z + 1.5, dungeon!.w + 0.5);
  const room = await page.evaluate(([x0, y0, z0, w0]) => {
    const hc = window.__hc;
    const chests: { pos: number[]; items: number }[] = [];
    let spawner: number[] | null = null;
    for (let w = w0! - 3; w <= w0! + 3; w++)
      for (let z = z0! - 3; z <= z0! + 3; z++)
        for (let y = y0!; y <= y0! + 5; y++)
          for (let x = x0! - 3; x <= x0! + 3; x++) {
            const b = hc.blockAt(x, y, z, w);
            if (b === 'mob_spawner') spawner = [x, y, z, w];
            if (b === 'chest') {
              let items = 0;
              for (let s = 0; s < 27; s++) if (hc.beGet(x, y, z, w, s)) items++;
              chests.push({ pos: [x, y, z, w], items });
            }
          }
    return { spawner, spawnerEntity: spawner ? hc.blockEntity(spawner[0]!, spawner[1]!, spawner[2]!, spawner[3]!) : null, chests, loaded: hc.spawnerCount() };
  }, [dungeon!.x, dungeon!.y, dungeon!.z, dungeon!.w]);
  report.room = room;
  expect(room.spawner).not.toBeNull();
  expect((room.spawnerEntity as { type: string } | null)?.type).toBe('spawner');
  expect(room.loaded).toBeGreaterThan(0);
  expect(room.chests.length).toBeGreaterThan(0);
  expect(room.chests.some((c) => c.items > 0)).toBe(true);
  // Light the room (dungeons are dark) for the screenshot: lanterns in two floor corners.
  await page.evaluate(([x, y, z, w]) => {
    const hc = window.__hc;
    hc.setBlock(x! - 2, y! + 1, z! - 2, w!, 'lantern');
    hc.setBlock(x! + 2, y! + 1, z! + 2, w!, 'lantern');
    hc.setView({ yaw: 200, pitch: -20 });
    hc.teleport(x! + 1.5, y! + 1.05, z! + 1.5, w! + 0.5);
  }, [dungeon!.x, dungeon!.y, dungeon!.z, dungeon!.w]);
  await page.evaluate(() => window.__hc.idle(240_000));
  await shot(page, 'dungeon');

  // The spawner works once mobs are allowed: a mob of its kind appears nearby.
  const mob = (room.spawnerEntity as { mob: string }).mob;
  const spawned = await page.evaluate((n) => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setDifficulty('normal');
    hc.setMobSpawning(true);
    hc.clearMobs();
    // Up to four spawn cycles (10-40 s apart); one is almost always enough.
    for (let t = 0; t < 160; t += 5) {
      hc.tickWorld(5);
      if (hc.mobs().some((m) => m.name === n)) break;
    }
    return hc.mobs().filter((m) => m.name === n).length;
  }, mob);
  report.spawnerMob = { mob, spawned };
  expect(spawned).toBeGreaterThan(0);
  await page.evaluate(() => window.__hc.setMobSpawning(false));

  mkdirSync(dir(), { recursive: true });
  writeFileSync(`${dir()}/structures.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
