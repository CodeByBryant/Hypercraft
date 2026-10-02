import { expect, test } from '@playwright/test';
import { boot } from './util';

// New ores' uses: TNT (sulfur) chain-blasts a crater; a spectral arrow (lumenite) makes the
// mob it hits glow (outlined through walls and off the slice); silver arrows hit the undead
// twice as hard.

interface G {
  primeTnt(x: number, y: number, z: number, w: number, fuse?: number): boolean;
  mobs: { list: { id: number; glowing: number; health: number }[] };
}

test('TNT chain reaction and spectral arrows', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=tnt', errors);

  const tnt = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.setMode('creative');
    hc.setMobSpawning(false);
    hc.clearMobs();
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), y = Math.floor(s.pos[1]!) - 1, z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    hc.setBlock(x, y, z + 4, w, 'tnt');
    hc.setBlock(x, y, z + 7, w, 'tnt');
    const lit = g.primeTnt(x, y, z + 4, w);
    const litBlock = hc.blockAt(x, y, z + 4, w);
    // Wait out the fuse (4 s), then the chained one (0.5-1.5 s).
    const t0 = performance.now();
    while (hc.blockAt(x, y, z + 7, w) !== 'air' && performance.now() - t0 < 60_000) await hc.frames(1);
    return { lit, litBlock, first: hc.blockAt(x, y, z + 4, w), second: hc.blockAt(x, y, z + 7, w), under: hc.blockAt(x, y - 1, z + 4, w), ms: performance.now() - t0 };
  });
  expect(tnt.lit).toBe(true);
  expect(tnt.litBlock).toBe('tnt_lit');
  expect(tnt.first).toBe('air');
  expect(tnt.second).toBe('air');
  expect(tnt.under).toBe('air'); // a crater, not just the TNT gone
  expect(tnt.ms).toBeGreaterThan(3000); // it waited for the fuse

  // Spectral arrow: the hit mob glows and is outlined.
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    const g = (hc as unknown as { game: G }).game;
    hc.setMode('survival');
    hc.setHealth(20);
    hc.setView({ yaw: 180, pitch: 2 });
    await hc.frames(5);
    const id = hc.spawnMobAhead('ana_cow', 6);
    hc.freezeMobs(true);
    hc.clearInventory();
    hc.give('bow');
    hc.give('spectral_arrow', 4);
    hc.select(0);
    const before = g.mobs.list.find((m) => m.id === id)!.health;
    await hc.bow(1300);
    const t0 = performance.now();
    while (performance.now() - t0 < 5000 && !(g.mobs.list.find((m) => m.id === id)?.glowing ?? 0)) await hc.frames(1);
    const m = g.mobs.list.find((x) => x.id === id);
    await hc.frames(2);
    return { glowing: m?.glowing ?? 0, hurt: m ? before - m.health : before, lines: hc.lineSegments(), left: hc.inventory().filter((s) => s[1] === 'spectral_arrow').reduce((a, s) => a + s[2], 0) };
  });
  expect(r.left).toBe(3);
  expect(r.glowing).toBeGreaterThan(0);
  expect(r.hurt).toBeGreaterThan(0);
  expect(r.lines).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
