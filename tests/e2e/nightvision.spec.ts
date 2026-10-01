import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Night vision (creative / spectator, N or the touch button): a moonless night lit up like day.

const dir = () => process.env.SHOT_DIR ?? 'test-results/nightvision';

/** Mean brightness (0..255) of the screen, measured in the page from a screenshot. */
async function brightness(page: Page, name: string): Promise<number> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  const png = await page.screenshot({ path: `${dir()}/${name}.png` });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 320, 180);
    const d = g.getImageData(0, 0, 320, 120).data; // above the hotbar
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

test('night vision: N lights up the night in creative and spectator, not in survival', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=night', errors);
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setWeather('clear');
    hc.setTime(18000); // midnight
    hc.setView({ pitch: -25 });
    await hc.frames(3);
  });
  const dark = await brightness(page, 'night-off');

  // N toggles it (creative); the light fades in over a fraction of a second.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.key('KeyN', true);
    await hc.frames(2);
    hc.key('KeyN', false);
    await hc.frames(40);
  });
  expect(await page.evaluate(() => window.__hc.nightVision())).toBe(true);
  const lit = await brightness(page, 'night-vision');
  expect(lit).toBeGreaterThan(dark * 1.6 + 10);

  // Survival does not get it (the toggle stays, but it only works in creative / spectator).
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    await hc.frames(40);
  });
  expect(await page.evaluate(() => window.__hc.nightVision())).toBe(false);
  const survival = await brightness(page, 'night-survival');
  expect(survival).toBeLessThan(lit * 0.8);
  // Spectator does.
  await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('spectator');
    await hc.frames(40);
  });
  expect(await page.evaluate(() => window.__hc.nightVision())).toBe(true);
  console.log(JSON.stringify({ dark, lit, survival }));
  expect(errors).toEqual([]);
});
