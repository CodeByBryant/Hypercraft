import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Touch controls on a phone-sized screen (landscape), driven with real touch events:
// hotbar taps, closing the inventory and crafting screens with the ✕ button, tapping a mob to
// hit it, tap-to-place, and long-press mining under the finger.

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

const SHOTS = process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/../mobile` : 'test-results/mobile';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Screen position (CSS px) of a 4D world point in the current view. */
async function project(page: Page, p: number[]): Promise<[number, number]> {
  return page.evaluate((q) => {
    const g = (window.__hc as unknown as { game: { player: { cam: { fwd: Float64Array; right: Float64Array; up: Float64Array } }; eye(): Float64Array; params: { fovY: number }; canvas: HTMLCanvasElement } }).game;
    const cam = g.player.cam;
    const e = g.eye();
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k++) {
      const r = q[k]! - e[k]!;
      x += r * cam.right[k]!;
      y += r * cam.up[k]!;
      z += r * cam.fwd[k]!;
    }
    const tanY = Math.tan(g.params.fovY / 2);
    const tanX = tanY * (g.canvas.width / g.canvas.height);
    const nx = x / (z * tanX), ny = y / (z * tanY);
    return [((nx + 1) / 2) * window.innerWidth, ((1 - ny) / 2) * window.innerHeight] as [number, number];
  }, p);
}

async function touchHold(cdp: CDPSession, x: number, y: number, ms: number, page: Page): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }] });
  const t0 = Date.now();
  while (Date.now() - t0 < ms) await page.evaluate(() => window.__hc.frames(1));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('touch: hotbar, closing screens, tap to hit and place, long-press mining', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'touch=1&res=180&rd=2&seed=touch', errors);
  await expect(page.locator('.touch')).toBeVisible();
  const hc = () => page.evaluate(() => (window.__hc as unknown as { game: { hotbarIndex: number } }).game.hotbarIndex);

  // Hotbar: tapping a slot selects it (the touch layer used to swallow these taps).
  await page.tap('.hotbar .slot:nth-child(4)');
  await expect.poll(hc).toBe(3);
  await page.tap('.hotbar .slot:nth-child(7)');
  await expect.poll(hc).toBe(6);
  await shot(page, 'touch-hud');

  // Inventory: open with the button, close with ✕; touch controls come back.
  await page.tap('.tbtn.inv');
  await expect.poll(() => page.evaluate(() => window.__hc.screenOpen())).toBe(true);
  await shot(page, 'touch-inventory');
  await page.tap('.inv-close');
  await expect.poll(() => page.evaluate(() => window.__hc.screenOpen())).toBe(false);
  await expect(page.locator('.touch')).toBeVisible();

  // Crafting table: place one ahead, tap it to open, ✕ to close.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setView({ pitch: -40 });
    await hc.frames(3);
    hc.placeTarget('crafting_table');
    await hc.frames(3);
  });
  const table = await page.evaluate(() => window.__hc.target());
  expect(table?.name).toBe('crafting_table');
  const [tx, ty] = await project(page, [table!.x + 0.5, table!.y + 0.9, table!.z + 0.5, table!.w + 0.5]);
  await page.touchscreen.tap(tx, ty);
  await expect.poll(() => page.evaluate(() => window.__hc.screenOpen())).toBe(true);
  await shot(page, 'touch-crafting');
  await page.tap('.inv-close');
  await expect.poll(() => page.evaluate(() => window.__hc.screenOpen())).toBe(false);

  // Tap a mob off the crosshair to hit it (fist: 1 damage), in survival.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.breakTarget();
    hc.setMode('survival');
    hc.clearInventory();
    hc.setView({ pitch: -12 });
    hc.freezeMobs(true);
    hc.clearMobs();
    await hc.frames(2);
  });
  const sheep = await page.evaluate(() => window.__hc.spawnMobAhead('kata_sheep', 2.6, 1.1));
  const sp = (await page.evaluate(() => window.__hc.mobs()))[0]!.pos;
  const [sx, sy] = await project(page, [sp[0]!, sp[1]! + 0.8, sp[2]!, sp[3]!]);
  expect(sx).toBeGreaterThan(470); // clearly right of the crosshair
  await page.touchscreen.tap(sx, sy);
  await expect.poll(() => page.evaluate((id) => window.__hc.mobs().find((m) => m.id === id)?.health ?? -1, sheep)).toBeLessThan(8);

  // Tap the ground with a block in hand: it is placed where you tapped.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.clearMobs();
    hc.give('cobblestone', 8);
    hc.select(0);
    hc.setView({ pitch: -45 });
    await hc.frames(3);
  });
  const ground = await page.evaluate(() => window.__hc.target());
  expect(ground).not.toBeNull();
  const [gx, gy] = await project(page, [ground!.x + 0.5, ground!.y + 1, ground!.z + 0.5, ground!.w + 0.5]);
  await page.touchscreen.tap(gx, gy);
  await expect.poll(() => page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y!, z!, w!), [ground!.x, ground!.y + 1, ground!.z, ground!.w])).toBe('cobblestone');

  // Long-press mines the block under the finger (a fast pickaxe breaks it quickly).
  await page.evaluate(() => {
    window.__hc.give('hyperite_pickaxe');
    window.__hc.select(1);
  });
  const cdp = await page.context().newCDPSession(page);
  await touchHold(cdp, gx, gy, 1600, page);
  await expect.poll(() => page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y!, z!, w!), [ground!.x, ground!.y + 1, ground!.z, ground!.w])).toBe('air');
  expect(errors).toEqual([]);
});
