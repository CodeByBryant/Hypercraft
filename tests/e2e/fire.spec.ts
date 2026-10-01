import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from './util';

// Playtest fix: fire is animated, spreads through flammable blocks, burns them away, and
// sets players and mobs on fire. Light a planks block with the real flint and steel, watch
// the flames move, fast-forward the spread, then stand in it.

const dir = () => process.env.SHOT_DIR ?? 'test-results/fire';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

test('fire: flint and steel, flickering flames, spread, burn-out, burning players and mobs', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=fire', errors);
  const report: Record<string, unknown> = {};

  // A 4D block of planks (5 x 3 x 5 x 3 in x, y, z, w) on a stone pad, 3 blocks ahead along +x.
  const hut = await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setWeather('clear');
    hc.setTime(6000);
    const s = hc.state();
    const x0 = Math.floor(s.pos[0]!) + 3, z0 = Math.floor(s.pos[2]!) - 2, w0 = Math.floor(s.pos[3]!) - 1;
    const y0 = Math.floor(s.pos[1]!);
    for (let x = x0 - 4; x < x0 + 9; x++)
      for (let z = z0 - 4; z < z0 + 9; z++)
        for (let w = w0 - 4; w < w0 + 7; w++) {
          hc.setBlock(x, y0 - 1, z, w, 'stone');
          for (let y = y0; y < y0 + 8; y++) hc.setBlock(x, y, z, w, 'air');
        }
    for (let x = x0; x < x0 + 5; x++) for (let z = z0; z < z0 + 5; z++) for (let w = w0; w < w0 + 3; w++) for (let y = y0; y < y0 + 3; y++) hc.setBlock(x, y, z, w, 'planks');
    return [x0, y0, z0, w0];
  });
  const [x0, y0, z0, w0] = hut as [number, number, number, number];
  const planks = () =>
    page.evaluate(
      ([x, y, z, w]) => {
        const hc = window.__hc;
        let n = 0;
        for (let a = x!; a < x! + 5; a++) for (let c = z!; c < z! + 5; c++) for (let d = w!; d < w! + 3; d++) for (let b = y!; b < y! + 3; b++) if (hc.blockAt(a, b, c, d) === 'planks') n++;
        return n;
      },
      [x0, y0, z0, w0],
    );
  expect(await planks()).toBe(225);

  // Face the planks (+x) from 2.5 blocks away and use flint and steel on their side.
  const lit = await page.evaluate(
    async ([x, y, z, w]) => {
      const hc = window.__hc;
      hc.setMode('survival');
      hc.clearInventory();
      hc.give('flint_and_steel', 1);
      hc.select(0);
      for (const yaw of [90, -90, 0, 180]) {
        hc.setView({ yaw, pitch: -12 });
        if (hc.state().fwd[0]! > 0.6) break;
      }
      hc.teleport(x! - 2.5, y! + 0.01, z! + 2.5, w! + 1.5);
      await hc.frames(3);
      const t = hc.target();
      hc.use();
      await hc.frames(3);
      return { target: t?.name, fires: hc.fires(), fire: hc.blockAt(x! - 1, t ? t.y : y!, z! + 2, w! + 1) };
    },
    [x0, y0, z0, w0],
  );
  report.lit = lit;
  expect(lit.target).toBe('planks');
  expect(lit.fires).toBe(1);
  expect(lit.fire).toBe('fire');

  // The flames flicker: the same view rendered 0.4 s apart differs around the fire.
  await page.evaluate(() => window.__hc.idle(120_000));
  await shot(page, 'fire-lit');
  const clip = { x: 540, y: 260, width: 200, height: 200 };
  await page.evaluate(() => window.__hc.renderNow());
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__hc.renderNow());
  const b = await page.screenshot({ clip });
  expect(Buffer.compare(a, b)).not.toBe(0);

  // Two minutes of fire: it spreads over the block and eats it.
  await page.evaluate(() => window.__hc.fireTicks(20 * 120));
  const left = await planks();
  const fires = await page.evaluate(() => window.__hc.fires());
  report.planksLeft = left;
  report.fires = fires;
  expect(left).toBeLessThan(150);
  await page.evaluate(() => window.__hc.idle(120_000));
  await shot(page, 'fire-spread');

  // Stand in a fire: you catch fire and burn (the screen shows flames), water puts it out.
  const burn = await page.evaluate(
    async ([x, y, z, w]) => {
      const hc = window.__hc;
      let cell: number[] | null = null;
      for (let a = x! - 1; a < x! + 6 && !cell; a++)
        for (let c = z! - 1; c < z! + 6 && !cell; c++)
          for (let d = w! - 1; d < w! + 4 && !cell; d++) for (let b = y!; b < y! + 4 && !cell; b++) if (hc.blockAt(a, b, c, d) === 'fire') cell = [a, b, c, d];
      if (!cell) {
        hc.setBlock(x! - 1, y!, z!, w!, 'fire');
        cell = [x! - 1, y!, z!, w!];
      }
      hc.setHealth(20);
      hc.teleport(cell[0]! + 0.5, cell[1]! + 0.01, cell[2]! + 0.5, cell[3]! + 0.5);
      for (let i = 0; i < 40 && hc.burning() <= 0; i++) await hc.frames(1);
      const burning = hc.burning();
      await hc.frames(30);
      return { burning, health: hc.vitals().health };
    },
    [x0, y0, z0, w0],
  );
  report.burn = burn;
  expect(burn.burning).toBeGreaterThan(5);
  expect(burn.health).toBeLessThan(20);
  await shot(page, 'fire-burning');
  const doused = await page.evaluate(async () => {
    const hc = window.__hc;
    const s = hc.state().pos;
    const x = Math.floor(s[0]!) - 3, y = Math.floor(s[1]!), z = Math.floor(s[2]!), w = Math.floor(s[3]!);
    hc.setBlock(x, y, z, w, 'water');
    hc.teleport(x + 0.5, y + 0.01, z + 0.5, w + 0.5);
    for (let i = 0; i < 30 && hc.burning() > 0; i++) await hc.frames(1);
    return hc.burning();
  });
  expect(doused).toBe(0);

  // A sheep in a fire catches fire too.
  const sheep = await page.evaluate(
    async ([x, y, z, w]) => {
      const hc = window.__hc;
      hc.setBlock(x! - 2, y!, z! + 6, w!, 'fire');
      const id = hc.spawnMob('kata_sheep', x! - 1.5, y! + 0.01, z! + 6.5, w! + 0.5);
      for (let i = 0; i < 60 && hc.mobBurning(id) <= 0; i++) await hc.frames(1);
      return hc.mobBurning(id);
    },
    [x0, y0, z0, w0],
  );
  report.sheepBurning = sheep;
  expect(sheep).toBeGreaterThan(0);

  mkdirSync(dir(), { recursive: true });
  writeFileSync(`${dir()}/fire.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
