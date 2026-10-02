import { expect, test } from '@playwright/test';
import { boot } from './util';

// Buried bricks (all solid, one value on every open face) are stored on the GPU as a single
// value. That must never show: renders with and without the collapsing are identical, in
// normal and x-ray (spectator) views, and digging into rock uncovers the ore behind it.

interface Shot {
  w: number;
  h: number;
  data: number[];
}

/** Fraction of pixels that differ by more than a couple of levels in any channel. */
function diff(a: Shot, b: Shot): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (Math.abs(a.data[i]! - b.data[i]!) > 2 || Math.abs(a.data[i + 1]! - b.data[i + 1]!) > 2 || Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 2) n++;
  return n / (a.data.length / 4);
}

/** Mean colour of the centre tenth of the frame. */
function centre(a: Shot): number[] {
  const out = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(a.h * 0.45); y < a.h * 0.55; y++)
    for (let x = Math.floor(a.w * 0.45); x < a.w * 0.55; x++) {
      const o = (y * a.w + x) * 4;
      for (let k = 0; k < 3; k++) out[k] += a.data[o + k]!;
      n++;
    }
  return out.map((v) => v / n);
}

test('buried bricks render exactly like the stored ones', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=bricks&particles=0', errors);
  await page.setViewportSize({ width: 320, height: 180 });

  // On and off captured back to back (no frames between: same clock, sky and clouds).
  const both = async (): Promise<[Shot, Shot]> =>
    page.evaluate(async () => {
      const hc = window.__hc;
      hc.setTime(6000);
      await hc.frames(10);
      const on = hc.capture(100);
      hc.setBrickCollapse(false);
      const off = hc.capture(100);
      hc.setBrickCollapse(true);
      return [on, off] as [Shot, Shot];
    });

  // Spectator: above ground, then buried in rock (x-ray), straight and on a tilted slice.
  const spawn = await page.evaluate(() => {
    const hc = window.__hc;
    hc.setMode('spectator');
    hc.setTime(6000);
    return hc.state().pos;
  });
  for (const v of [
    { dy: 3, view: { pitch: -20 } },
    { dy: -16, view: { pitch: -5 } },
    { dy: -24, view: { pitch: 10, xw: 30 } },
  ]) {
    await page.evaluate(
      async ([p, dy, view]) => {
        const hc = window.__hc;
        hc.teleport(p[0]!, p[1]! + dy, p[2]!, p[3]!);
        hc.setView(view);
        await hc.idle(120_000);
      },
      [spawn, v.dy, v.view] as const,
    );
    const [on, off] = await both();
    expect(diff(on, off)).toBeLessThan(0.002);
  }

  // Creative, in a pocket dug in the rock with night vision: an ore block hidden behind a
  // stone wall is buried (collapsed); dig the wall and the ore must show.
  const r = await page.evaluate(
    async ([p]) => {
      const hc = window.__hc;
      hc.setMode('creative');
      hc.setFlying(true);
      const g = (hc as unknown as { game: { toggleNightVision(): void } }).game;
      g.toggleNightVision();
      const ex = Math.floor(p[0]!), ey = Math.floor(p[1]!) - 30, ez = Math.floor(p[2]!), ew = Math.floor(p[3]!);
      hc.setView({ yaw: 0, pitch: 0 });
      const f = hc.state().fwd;
      // Forward axis of the view (x or z) and its sign.
      const ax = Math.abs(f[0]!) > Math.abs(f[2]!) ? 0 : 2;
      const sg = Math.sign(f[ax]!) || 1;
      const at = (a: number, b: number, c: number, d: number) => (ax === 0 ? [ex + sg * c, ey + b, ez + a, ew + d] : [ex + a, ey + b, ez + sg * c, ew + d]);
      for (let a = -2; a <= 2; a++)
        for (let b = -2; b <= 2; b++)
          for (let d = -2; d <= 2; d++)
            for (let c = -2; c <= 7; c++) {
              const q = at(a, b, c, d);
              const inPocket = Math.abs(a) <= 1 && Math.abs(b) <= 1 && Math.abs(d) <= 1 && c >= -1 && c <= 2;
              const name = inPocket ? 'air' : c >= 4 && c <= 6 ? 'iron_ore' : 'stone';
              hc.setBlock(q[0]!, q[1]!, q[2]!, q[3]!, name);
            }
      hc.teleport(ex + 0.5, ey - 1.1, ez + 0.5, ew + 0.5);
      hc.setView({ yaw: 0, pitch: 0 });
      await hc.frames(30);
      await hc.idle(120_000);
      return { ax, sg, ex, ey, ez, ew };
    },
    [spawn] as const,
  );
  const [wallOn, wallOff] = await both();
  expect(diff(wallOn, wallOff)).toBeLessThan(0.002);
  // Dig the stone wall between the pocket and the ore.
  await page.evaluate(async (o) => {
    const hc = window.__hc;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let d = -1; d <= 1; d++) {
          const q = o.ax === 0 ? [o.ex + o.sg * 3, o.ey + b, o.ez + a, o.ew + d] : [o.ex + a, o.ey + b, o.ez + o.sg * 3, o.ew + d];
          hc.setBlock(q[0]!, q[1]!, q[2]!, q[3]!, 'air');
        }
    await hc.frames(5);
    await hc.idle(120_000);
  }, r);
  const [oreOn, oreOff] = await both();
  expect(diff(oreOn, oreOff)).toBeLessThan(0.002);
  // And the ore really is there: the centre of the view changed from the plain wall.
  const c0 = centre(wallOn), c1 = centre(oreOn);
  expect(Math.abs(c0[0]! - c1[0]!) + Math.abs(c0[1]! - c1[1]!) + Math.abs(c0[2]! - c1[2]!)).toBeGreaterThan(6);
  expect(errors).toEqual([]);
});
