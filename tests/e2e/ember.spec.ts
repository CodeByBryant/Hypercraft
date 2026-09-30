import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from './util';

// Phase 6: the Ember Depths in the three R6 views, and a tour of its biomes.

const VIEWS = [
  { name: '1-axis-aligned', view: { yaw: 20, pitch: -12 } },
  { name: '2-xw-30', view: { yaw: 20, xw: 30, pitch: -12 } },
  { name: '3-xw45-zw45', view: { yaw: 20, xw: 45, zw: 45, pitch: -12 } },
];
const LINEUP: [string, number, number][] = [
  ['cinder_hound', 4, -1.4],
  ['soul_wisp', 4.5, 1.2],
  ['lava_slime', 5.5, 2.8],
  ['ember_brute', 7, -2.6],
  ['citadel_guard', 6.5, 0.6],
  ['magma_drake', 9, 2.6],
  ['slag_golem', 10, -1],
];
const BIOMES = ['cinder_plains', 'basalt_prisms', 'sulfur_fungal_forest', 'magma_sea', 'ash_wastes', 'soul_glass_canyons', 'emberglass_grove', 'shattered_tesseracts'];

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-6';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

async function travel(page: Page, p: number[]): Promise<void> {
  await page.evaluate(([a, b, c, d]) => window.__hc.travel(a!, b!, c!, d!), p);
  await page.evaluate(() => window.__hc.ready(180_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}

test('ember depths: R6 views and biomes', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=ember&realm=ember', errors);
  expect(await page.evaluate(() => window.__hc.realm())).toBe('ember');
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('spectator');
    hc.setFlying(true);
  });
  const report: Record<string, unknown> = {};
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
    await shot(page, `ember-${v.name}`);
  }
  // ---- The Ember mobs, lined up and frozen, in the three views (on the spawn ground).
  await page.evaluate((p) => {
    const hc = window.__hc;
    hc.setMode('creative');
    hc.setFlying(false);
    hc.teleport(p[0]!, p[1]!, p[2]!, p[3]!);
    hc.freezeMobs(true);
    hc.setView({ yaw: 20, pitch: -10 });
  }, start);
  await page.evaluate(() => window.__hc.idle(240_000));
  const mobShots: Record<string, number> = {};
  for (const v of VIEWS) {
    const packed = await page.evaluate(
      async ([view, lineup, aligned]) => {
        const hc = window.__hc;
        hc.clearMobs();
        hc.setView(view as { pitch: number });
        for (const [n, d, s] of lineup as [string, number, number][]) hc.spawnMobAhead(n, d, s, 0, aligned as boolean);
        await hc.frames(2);
        return hc.packedMobs();
      },
      [v.view, LINEUP, v.name !== '1-axis-aligned'] as const,
    );
    mobShots[v.name] = packed;
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `ember-mobs-${v.name}`);
  }
  report.mobShots = mobShots;
  expect(mobShots['1-axis-aligned']).toBe(LINEUP.length);
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.freezeMobs(false);
    hc.setMode('spectator');
    hc.setFlying(true);
  });

  for (const b of BIOMES) {
    const at = await page.evaluate((n) => window.__hc.findBiome(n, 4000), b);
    report[b] = at;
    if (!at) continue;
    await travel(page, [at[0]!, at[1]! + 7, at[2]!, at[3]!]);
    await page.evaluate(() => window.__hc.setView({ yaw: 30, pitch: -18 }));
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `biome-${b}`);
  }
  // ---- The Magma Regent: find its caldera on the lava sea (data-driven structure grid).
  const cal = await page.evaluate(() => window.__hc.locate(['regent_caldera'], 3000));
  expect(cal).not.toBeNull();
  report.caldera = cal;
  // Stand on the arena deck, a few blocks from the throne.
  await travel(page, [cal!.x + 6.5, cal!.y + 1.1, cal!.z + 0.5, cal!.w + 0.5]);
  await page.evaluate(() => window.__hc.frames(10));
  let boss = await page.evaluate(() => window.__hc.boss());
  expect(boss?.name).toBe('magma_regent');
  report.bossSpawned = boss;
  // R6: the arena and the Regent in three views (frozen for the shots).
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.freezeMobs(true);
    hc.setMode('spectator');
    hc.setFlying(true);
  });
  const arena = await page.evaluate(() => window.__hc.mobs().find((m) => m.name === 'magma_regent')!.pos);
  for (const v of VIEWS) {
    await page.evaluate(
      ([view, c]) => {
        const hc = window.__hc;
        hc.setView({ ...(view as object), pitch: -8 } as { pitch: number });
        const f = hc.state().fwd;
        hc.teleport(c[0]! - f[0]! * 9, c[1]! + 0.5 - f[1]! * 9, c[2]! - f[2]! * 9, c[3]! - f[3]! * 9);
      },
      [v.view, arena] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    await shot(page, `regent-${v.name}`);
  }
  // The fight: survival, on the deck. The Regent engages and telegraphs lava pillars along W.
  await page.evaluate(([x, y, z, w]) => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setFlying(false);
    hc.setView({ yaw: 20, pitch: -10 });
    hc.teleport(x! + 6.5, y! + 1.1, z! + 0.5, w! + 0.5);
    hc.freezeMobs(false);
    hc.setHealth(20);
  }, [cal!.x, cal!.y, cal!.z, cal!.w]);
  await page.waitForFunction(() => (window.__hc.boss()?.pillars.length ?? 0) > 0 && window.__hc.boss()!.pillars.some((p) => p.erupt > 0), null, { timeout: 60_000 });
  boss = await page.evaluate(() => window.__hc.boss());
  report.telegraph = { pillars: boss!.pillars.length, warning: boss!.warning };
  expect(boss!.warning).toContain('Lava pillars');
  // Pillars line up along world W through the player (plus the slice's right axis in phase 2).
  const ws = new Set(boss!.pillars.map((p) => p.w));
  expect(ws.size).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__hc.setHealth(20));
  await shot(page, 'regent-telegraph');
  await page.waitForFunction(() => window.__hc.boss()?.pillars.some((p) => p.erupt <= 0) ?? false, null, { timeout: 30_000 });
  await page.evaluate(() => window.__hc.setHealth(20));
  await shot(page, 'regent-pillars');
  const magma = await page.evaluate(() => {
    const hc = window.__hc;
    const b = hc.boss()!;
    return b.pillars.filter((p) => p.erupt <= 0).some((p) => hc.blockAt(p.x, p.y, p.z, p.w) === 'erupting_magma');
  });
  expect(magma).toBe(true);
  // Phase 2 at half health: hounds join.
  const id = boss!.id;
  await page.evaluate(([i, h]) => window.__hc.hurtMob(i!, h! * 0.55), [id, boss!.max]);
  await page.waitForFunction(() => window.__hc.boss()?.phase === 2, null, { timeout: 10_000 });
  const hounds = await page.evaluate(() => window.__hc.mobs().filter((m) => m.name === 'cinder_hound').length);
  expect(hounds).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__hc.setHealth(20));
  await shot(page, 'regent-enraged');
  // The kill drops the Regent Heart.
  await page.evaluate((i) => window.__hc.hurtMob(i, 1000), id);
  await page.waitForFunction(() => window.__hc.boss() === null, null, { timeout: 10_000 });
  const loot = await page.evaluate(() => window.__hc.dropped().map((d) => d[0]));
  report.bossLoot = loot;
  expect(loot).toContain('regent_heart');

  mkdirSync(dir(), { recursive: true });
  writeFileSync(`${dir()}/ember.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  expect(errors).toEqual([]);
});
