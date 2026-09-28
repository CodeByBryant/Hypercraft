import { expect, test } from '@playwright/test';
import { boot } from './util';

// CI smoke test: boot, generate world, walk, mine a block, place a block, rotate view, screenshot.
test('boot → walk → mine → place → rotate → screenshot', async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, 'res=180&rd=3&seed=smoke', errors);

  const s0 = await page.evaluate(() => window.__hc.state());
  expect(s0.columns).toBeGreaterThan(20);
  expect(s0.loaded).toBe(true);

  // Walk forward (+Z in the base frame) for ~1.5 s of real time.
  await page.evaluate(() => {
    window.__hc.setMode('survival');
    window.__hc.setView({ pitch: 0 });
    window.__hc.key('KeyW', true);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__hc.key('KeyW', false));
  await page.evaluate(() => window.__hc.frames(10));
  const s1 = await page.evaluate(() => window.__hc.state());
  const moved = Math.hypot(s1.pos[0]! - s0.pos[0]!, s1.pos[2]! - s0.pos[2]!, s1.pos[3]! - s0.pos[3]!);
  expect(moved).toBeGreaterThan(1.5);

  // Mine the block under our feet (look straight down).
  await page.evaluate(() => window.__hc.setView({ pitch: -89 }));
  await page.evaluate(() => window.__hc.frames(3));
  const t = await page.evaluate(() => window.__hc.target());
  expect(t).not.toBeNull();
  expect(t!.axis).toBe(1); // top facet
  const broke = await page.evaluate(() => window.__hc.breakTarget());
  expect(broke).toBe(true);
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y!, z!, w!), [t!.x, t!.y, t!.z, t!.w])).toBe('air');

  // Place glass back into the hole (on the top facet of the block below it).
  await page.evaluate(() => window.__hc.setMode('creative'));
  await page.evaluate(() => window.__hc.setFlying(true));
  await page.evaluate(() => window.__hc.frames(3));
  const t2 = await page.evaluate(() => window.__hc.target());
  expect(t2).not.toBeNull();
  const placed = await page.evaluate(() => window.__hc.placeTarget('glass'));
  expect(placed).toBe(true);
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y! + 1, z!, w!), [t2!.x, t2!.y, t2!.z, t2!.w])).toBe('glass');

  // Rotate the slice (XW + ZW tilt) and render.
  await page.evaluate(() => window.__hc.setView({ xw: 30, zw: 20, pitch: -15 }));
  await page.evaluate(() => window.__hc.idle(240_000));
  const s2 = await page.evaluate(() => window.__hc.state());
  expect(Math.abs(s2.hidden[0]!)).toBeGreaterThan(0.3);
  const ms = await page.evaluate(() => window.__hc.renderNow());
  const steps = await page.evaluate(() => window.__hc.raySteps());
  expect(steps.avg).toBeGreaterThan(1);
  const shot = await page.screenshot();
  await info.attach('rotated-view', { body: shot, contentType: 'image/png' });
  console.log(`smoke: moved ${moved.toFixed(2)} blocks, render ${ms.toFixed(0)} ms (software GL), steps avg ${steps.avg.toFixed(1)}`);
  expect(errors).toEqual([]);
});
