import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from './util';

// Phase 4: mobs rendered as exact 4D cross-sections in the three R6 views, melee combat with
// drops, the R2 proximity warning for a stalker hidden ana of the slice, the bow, explosions,
// player damage, the death screen and respawn.

const LINEUP: [string, number, number][] = [
  // name, distance ahead, offset right
  ['kata_sheep', 4.5, -1.2],
  ['ana_cow', 6, 1.8],
  ['shambler', 7, -3.2],
  ['phase_creeper', 8, 0.2],
  ['hyperchicken', 3.5, 1.3],
  ['kata_slime', 5.5, 3.6],
  ['web_weaver', 9, -1.2],
  ['bone_archer', 9.5, 2.9],
];

const VIEWS = [
  { name: '1-axis-aligned', view: { pitch: -10 } },
  { name: '2-xw-30', view: { xw: 30, pitch: -10 } },
  { name: '3-xw45-zw45', view: { xw: 45, zw: 45, pitch: -10 } },
];

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOT_DIR ?? 'test-results/phase-4';
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test('mobs: cross-sections, combat, proximity warning, bow, explosions, death and respawn', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=3&seed=mobs', errors);
  const count = async (name: string) => (await page.evaluate(() => window.__hc.inventory())).filter((s) => s[1] === name).reduce((a, s) => a + s[2], 0);

  // ---- R6 views with a line-up of mobs (frozen so the shots are stable).
  await page.evaluate(() => {
    window.__hc.setMode('survival');
    window.__hc.setTime(1500);
    window.__hc.freezeMobs(true);
  });
  const report: Record<string, unknown>[] = [];
  for (const v of VIEWS) {
    const packed = await page.evaluate(
      async ([view, lineup, aligned]) => {
        window.__hc.clearMobs();
        window.__hc.setView(view as { pitch: number });
        for (const [n, d, s] of lineup as [string, number, number][]) window.__hc.spawnMobAhead(n, d, s, 0, aligned as boolean);
        await window.__hc.frames(2);
        return window.__hc.packedMobs();
      },
      [v.view, LINEUP, v.name !== '1-axis-aligned'] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    const ms = await page.evaluate(() => window.__hc.benchRender(3));
    await shot(page, `mobs-${v.name}`);
    // Cost of the mobs: the same view without them.
    const ms0 = await page.evaluate(async () => {
      const hc = window.__hc;
      const keep = hc.mobs();
      hc.clearMobs();
      await hc.frames(2);
      const t = hc.benchRender(3);
      return { t, n: keep.length };
    });
    report.push({ view: v.name, packed, renderMs: ms, renderMsNoMobs: ms0.t, mobCostPct: Math.round(((ms - ms0.t) / ms0.t) * 1000) / 10 });
    if (v.name === '1-axis-aligned') expect(packed).toBe(LINEUP.length); // every body crosses the slice
    else expect(packed).toBeGreaterThan(0);
  }
  writeFileSync(`${process.env.SHOT_DIR ?? 'test-results/phase-4'}/mobs.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  // ---- Melee: an iron sword kills a sheep in two hits; it drops wool and mutton.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.setView({ pitch: -25 });
    hc.clearInventory();
    hc.give('iron_sword');
    hc.select(0);
    hc.freezeMobs(false);
    await hc.frames(2);
  });
  const sheep = await page.evaluate(() => window.__hc.spawnMobAhead('kata_sheep', 1.9));
  let hits = 0;
  for (let i = 0; i < 10; i++) {
    const alive = await page.evaluate((id) => window.__hc.mobs().some((m) => m.id === id), sheep);
    if (!alive) break;
    await page.evaluate(async (id) => {
      const hc = window.__hc;
      hc.placeMobAhead(id, 1.9);
      await hc.frames(2);
    }, sheep);
    expect(await page.evaluate(() => window.__hc.targetMob()?.name)).toBe('kata_sheep');
    await page.evaluate(() => window.__hc.attack());
    hits++;
    await page.waitForTimeout(700); // sword cooldown and the mob's hurt flash
  }
  expect(await page.evaluate((id) => window.__hc.mobs().some((m) => m.id === id), sheep)).toBe(false);
  expect(hits).toBeGreaterThanOrEqual(2);
  expect(hits).toBeLessThanOrEqual(3);
  const woolAround = async () => (await count('wool')) + (await page.evaluate(() => window.__hc.dropped())).filter((d) => d[0] === 'wool').length;
  await expect.poll(woolAround, { timeout: 15_000 }).toBeGreaterThan(0);
  const sword = (await page.evaluate(() => window.__hc.inventory())).find((s) => s[1] === 'iron_sword')!;
  expect(sword[3]).toBe(hits); // one point of wear per hit

  // ---- R2: a stalker lurking 5 blocks ana of the slice is invisible, but announced.
  const stalker = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.freezeMobs(true);
    hc.setView({ pitch: -10 });
    const id = hc.spawnMobAhead('ana_stalker', 2.5, 0.5, 5);
    await hc.frames(2);
    return id;
  });
  await page.waitForTimeout(400); // threat scan (5 Hz) and HUD refresh (10 Hz)
  await page.evaluate(() => window.__hc.frames(3));
  expect(await page.evaluate(() => window.__hc.packedMobs())).toBe(0);
  const th = await page.evaluate(() => window.__hc.threat());
  expect(th.glow[1]).toBeGreaterThan(0.3); // ana side glows
  expect(th.glow[0]).toBe(0);
  expect(th.text).toContain('Ana Stalker');
  expect(th.text).toContain('ana');
  await shot(page, 'threat-stalker-ana');
  // It steps into your slice: now it is visible and the warning goes away.
  await page.evaluate(async (id) => {
    window.__hc.placeMobAhead(id, 2.5, 0.5, 0);
    await window.__hc.frames(3);
  }, stalker);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__hc.frames(3));
  expect(await page.evaluate(() => window.__hc.packedMobs())).toBe(1);
  expect((await page.evaluate(() => window.__hc.threat())).glow[1]).toBe(0);
  await shot(page, 'threat-stalker-in-slice');

  // ---- Bow: a full draw shoots one arrow along the view.
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.clearInventory();
    hc.give('bow');
    hc.give('arrow', 4);
    hc.select(0);
    hc.setView({ pitch: 5 });
  });
  await page.evaluate(() => window.__hc.bow(1300));
  const arrows = await page.evaluate(() => window.__hc.arrows());
  expect(arrows.length).toBe(1);
  expect(arrows[0]!.byPlayer).toBe(true);
  expect(await count('arrow')).toBe(3);

  // ---- Explosion: a 4D crater and blast damage.
  await page.evaluate(() => window.__hc.setHealth(20));
  const crater = await page.evaluate(() => {
    const s = window.__hc.state();
    const x = Math.floor(s.pos[0]!) , y = Math.floor(s.pos[1]!) - 1, z = Math.floor(s.pos[2]!) + 3, w = Math.floor(s.pos[3]!);
    const before = window.__hc.blockAt(x, y, z, w);
    window.__hc.explode(x + 0.5, y + 0.5, z + 0.5, w + 0.5, 2.5);
    return { before, after: window.__hc.blockAt(x, y, z, w), hp: window.__hc.vitals().health };
  });
  expect(crater.before).not.toBe('air');
  expect(crater.after).toBe('air');
  expect(crater.hp).toBeLessThan(20);

  // ---- Death and respawn: the inventory spills, the death screen offers a respawn.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setView({ pitch: -10 });
    await hc.frames(15); // hurt cooldown from the blast
    hc.setHealth(2);
    hc.hurt(5, 'Test damage');
    await hc.frames(2);
  });
  expect((await page.evaluate(() => window.__hc.vitals())).dead).toBe(true);
  await expect(page.locator('.menu-card.death')).toBeVisible();
  await expect(page.locator('.menu-card.death')).toContainText('Test damage');
  expect(await count('bow')).toBe(0);
  await shot(page, 'death-screen');
  await page.click('.menu-card.death button.primary');
  await page.evaluate(() => window.__hc.ready(120_000));
  const after = await page.evaluate(() => window.__hc.vitals());
  expect(after.dead).toBe(false);
  expect(after.health).toBe(20);
  await expect(page.locator('.menu-card.death')).toHaveCount(0);
  expect(errors).toEqual([]);
});
