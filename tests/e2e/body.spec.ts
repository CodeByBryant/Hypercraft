import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 9.1: third person and the player's body. F5 cycles first person (a hand with the held item
// and a paper doll in the corner), third person from behind and from the front (your own model,
// drawn by the ray marcher like a mob, in the armour you wear). Rotating the slice turns the body
// with you.

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-9';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${dir()}/${name}.png` });
}

test('body: a hand and a paper doll in first person, your own model in third person', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=bodyview', errors);
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.setTime(6000);
    hc.clearInventory();
    hc.give('iron_sword');
    hc.select(0);
    hc.wear(0, 'azurite_helmet');
    hc.wear(1, 'phase_wings');
    hc.wear(2, 'azurite_leggings');
    hc.wear(3, 'azurite_boots');
    hc.setView({ yaw: 0, pitch: 10 });
    await hc.frames(8);
  });

  // First person: the hand holds the sword, the doll shows the armour; no body in the scene.
  expect(await page.evaluate(() => window.__hc.camera())).toBe(0);
  const first = await page.evaluate(() => ({
    body: window.__hc.body(),
    hand: getComputedStyle(document.querySelector('.hand')!).display,
    doll: getComputedStyle(document.querySelector('.paper-doll')!).display,
    item: getComputedStyle(document.querySelector('.hand-item')!).display,
  }));
  expect(first.body.packed).toBe(0);
  expect(first.body.armor.filter((a) => a !== null)).toHaveLength(3);
  expect(first.body.wings).toBe(true);
  expect(first.body.held).toBe('tool');
  expect(first.hand).not.toBe('none');
  expect(first.item).toBe('block');
  expect(first.doll).not.toBe('none');
  await shot(page, 'body-1-first-person');

  // A swing moves the hand.
  const swing = await page.evaluate(async () => {
    const hc = window.__hc;
    const t0 = (document.querySelector('.hand') as HTMLElement).style.transform;
    hc.swingArm();
    await hc.frames(2);
    const t1 = (document.querySelector('.hand') as HTMLElement).style.transform;
    return { t0, t1, swing: hc.body().swing };
  });
  expect(swing.t1).not.toBe(swing.t0);
  expect(swing.swing).toBeGreaterThanOrEqual(0);

  // Third person from behind: the model is packed for the ray marcher, the hand and doll go away.
  await page.evaluate(async () => {
    window.__hc.camera(1);
    await window.__hc.frames(4);
  });
  const third = await page.evaluate(() => ({
    body: window.__hc.body(),
    hand: getComputedStyle(document.querySelector('.hand')!).display,
    doll: getComputedStyle(document.querySelector('.paper-doll')!).display,
  }));
  expect(third.body.packed).toBeGreaterThan(10);
  expect(third.body.packed).toBeLessThanOrEqual(16);
  expect(third.hand).toBe('none');
  expect(third.doll).toBe('none');
  await shot(page, 'body-2-third-person');

  // From the front, with the slice tilted through W: the body turns with you.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.camera(2);
    hc.setView({ yaw: 20, pitch: 8, xw: 30 });
    await hc.frames(4);
  });
  await shot(page, 'body-3-third-person-front-tilted');

  // Back to first person: the body leaves the scene again.
  await page.evaluate(async () => {
    window.__hc.camera(0);
    await window.__hc.frames(3);
  });
  expect((await page.evaluate(() => window.__hc.body())).packed).toBe(0);
  expect(errors).toEqual([]);
});
