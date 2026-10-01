import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Spectator inside the ground sees through it, like Minecraft's: faces between solid blocks
// are not drawn, so from inside rock you see the cave walls facing you. Creative (and a
// spectator in open air) still sees the rock.

const dir = () => process.env.SHOT_DIR ?? 'test-results/spectator';

/** Mean colour (0..255) of the middle of the screen. */
async function centre(page: Page, name: string): Promise<number[]> {
  mkdirSync(dir(), { recursive: true });
  await page.evaluate(() => window.__hc.renderNow());
  const png = await page.screenshot({ path: `${dir()}/${name}.png` });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(Math.floor(img.width * 0.4), Math.floor(img.height * 0.35), Math.floor(img.width * 0.2), Math.floor(img.height * 0.2)).data;
    const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k]! += d[i + k]!;
    return s.map((v) => v / (d.length / 4));
  }, png.toString('base64'));
}

test('spectator x-ray: from inside rock you see the cave, not the rock', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=270&rd=2&seed=xray', errors);
  // A pocket of air 12 blocks down, its far wall red wool, the eye in solid stone 4 blocks
  // short of it, looking along +x.
  const eye = await page.evaluate(async () => {
    const hc = window.__hc;
    const s = hc.state();
    const x0 = Math.floor(s.pos[0]!), z0 = Math.floor(s.pos[2]!), w0 = Math.floor(s.pos[3]!);
    const y0 = hc.skyHeight(x0, z0, w0) - 14;
    for (let x = x0 - 2; x <= x0 + 12; x++)
      for (let y = y0 - 5; y <= y0 + 6; y++)
        for (let z = z0 - 5; z <= z0 + 5; z++) for (let w = w0 - 3; w <= w0 + 3; w++) hc.setBlock(x, y, z, w, 'stone');
    for (let x = x0 + 4; x <= x0 + 8; x++)
      for (let y = y0 - 2; y <= y0 + 3; y++) for (let z = z0 - 3; z <= z0 + 3; z++) for (let w = w0 - 1; w <= w0 + 1; w++) hc.setBlock(x, y, z, w, 'air');
    for (let y = y0 - 2; y <= y0 + 3; y++) for (let z = z0 - 3; z <= z0 + 3; z++) for (let w = w0 - 1; w <= w0 + 1; w++) hc.setBlock(x0 + 9, y, z, w, 'red_wool');
    hc.setMode('spectator');
    hc.setFlying(true);
    for (const yaw of [90, -90, 0, 180]) {
      hc.setView({ yaw, pitch: 0 });
      if (hc.state().fwd[0]! > 0.6) break;
    }
    const eyeUp = hc.state().eye[1]! - hc.state().pos[1]!;
    hc.teleport(x0 + 0.5, y0 + 0.5 - eyeUp, z0 + 0.5, w0 + 0.5);
    hc.key('KeyN', true);
    await hc.frames(2);
    hc.key('KeyN', false);
    await hc.frames(30);
    return [x0, y0, z0, w0];
  });
  await page.evaluate(() => window.__hc.idle(120_000));
  const s = await page.evaluate(() => window.__hc.state());
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y!, z!, w!), [Math.floor(s.eye[0]!), Math.floor(s.eye[1]!), Math.floor(s.eye[2]!), Math.floor(s.eye[3]!)])).toBe('stone');
  const xray = await centre(page, 'spectator-xray');
  // Creative at the same spot: the rock in front of your face.
  await page.evaluate(async () => {
    window.__hc.setMode('creative');
    await window.__hc.frames(2);
  });
  const rock = await centre(page, 'creative-in-rock');
  console.log(JSON.stringify({ eye, xray, rock }));
  // Red wool through the rock in spectator; grey stone in creative.
  expect(xray[0]!).toBeGreaterThan(xray[1]! * 1.8);
  expect(Math.abs(rock[0]! - rock[1]!)).toBeLessThan(25);
  expect(errors).toEqual([]);
});
