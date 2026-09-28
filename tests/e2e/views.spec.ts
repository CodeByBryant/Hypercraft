import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from './util';

// R6: the three reference views, rendered at 360p internal and saved for review.
//  1. axis-aligned (hidden axis = +W)             -> voxels must read as cubes
//  2. 30° XW tilt                                  -> stretched/split boxes (prisms)
//  3. 45° XW + 45° ZW tilt                         -> triangular/hexagonal prisms
const VIEWS = [
  { name: '1-axis-aligned', view: { pitch: -14 } },
  { name: '2-xw-30', view: { xw: 30, pitch: -14 } },
  { name: '3-xw45-zw45', view: { xw: 45, zw: 45, pitch: -14 } },
];

test('R6 reference views', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, 'res=360&rd=4&seed=hypercraft', errors);
  const outDir = process.env.SHOT_DIR ?? 'test-results/r6';
  mkdirSync(outDir, { recursive: true });
  const report: Record<string, unknown>[] = [];
  const spawn = (await page.evaluate(() => window.__hc.state())).pos;
  for (const v of VIEWS) {
    // Hover a few blocks above spawn, just in front of the engine test garden.
    await page.evaluate(
      ([pos, view]) => {
        const p = pos as number[];
        window.__hc.setFlying(true);
        window.__hc.teleport(p[0]!, p[1]! + 3, p[2]!, p[3]!);
        window.__hc.setView(view as { pitch: number });
      },
      [spawn, v.view] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    const ms = await page.evaluate(() => window.__hc.benchRender(3));
    const steps = await page.evaluate(() => window.__hc.raySteps());
    await page.screenshot({ path: `${outDir}/${v.name}.png` });
    const st = await page.evaluate(() => window.__hc.state());
    report.push({ view: v.name, renderMs: ms, steps, hidden: st.hidden, internal: st.internal });
  }
  writeFileSync(`${outDir}/views.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
