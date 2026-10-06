import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot } from './util';

// Phase 8: advancements v1. The root is earned on entering the world; holding things, mining,
// events and counters complete the rest; a toast announces each; key L opens the screen; the
// world remembers them (saved world data).

const dir = () => process.env.SHOT_DIR ?? 'test-results/phase-8';

test('advancements: earned by holding, mining and doing; announced; listed on L; saved', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=2&seed=advance', errors);
  const r = await page.evaluate(async () => {
    const hc = window.__hc;
    hc.setMode('survival');
    hc.setMobSpawning(false);
    hc.clearMobs();
    hc.clearInventory();
    await hc.frames(90); // the first poll
    const start = hc.advancements();
    // Holding things: a crafting table and a log.
    hc.give('crafting_table');
    hc.give('log');
    await hc.frames(90);
    const held = hc.advancements();
    // Mining: break the stone under our feet.
    const s = hc.state();
    const x = Math.floor(s.pos[0]!), y = Math.floor(s.pos[1]!), z = Math.floor(s.pos[2]!), w = Math.floor(s.pos[3]!);
    hc.setBlock(x + 2, y, z, w, 'stone');
    hc.harvestAt(x + 2, y, z, w);
    // An event, and a counter.
    hc.advEvent('sleep');
    hc.advEvent('void_gate');
    await hc.frames(5);
    const toast = (() => {
      const t = document.querySelector('.adv-toast') as HTMLElement | null;
      return t ? { shown: getComputedStyle(t).display, text: t.textContent ?? '' } : null;
    })();
    const after = hc.advancements();
    return { start, held, after, toast };
  });
  // (A test world starts with the creative kit in hand, which already earns a few holding goals.)
  expect(r.start.done).toContain('surface/root');
  expect(r.held.done).toEqual(expect.arrayContaining(['surface/root', 'surface/timber']));
  expect(r.after.done).toEqual(expect.arrayContaining(['mining/root', 'surface/bed', 'void/gate']));
  expect(r.after.progress.done).toBeGreaterThanOrEqual(6);
  expect(r.toast?.shown).toBe('flex');
  expect(r.toast?.text).toContain('Advancement made');

  // Key L opens the screen; its rows show done and locked goals; Escape closes it.
  await page.evaluate(() => window.__hc.key('KeyL', true));
  await page.evaluate(() => window.__hc.frames(3));
  await page.evaluate(() => window.__hc.key('KeyL', false));
  const open = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.adv-row')];
    return { open: document.querySelector('.adv-screen.open') !== null, rows: rows.length, done: rows.filter((x) => x.classList.contains('done')).length, locked: rows.filter((x) => x.classList.contains('locked')).length, tabs: document.querySelectorAll('.adv-tab').length };
  });
  expect(open.open).toBe(true);
  expect(open.tabs).toBe(8);
  expect(open.rows).toBeGreaterThanOrEqual(8);
  expect(open.done).toBeGreaterThanOrEqual(3);
  expect(open.locked).toBeGreaterThanOrEqual(1);
  mkdirSync(dir(), { recursive: true });
  await page.screenshot({ path: `${dir()}/advancements.png` });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.querySelector('.adv-screen.open') !== null)).toBe(false);

  // Saved with the world.
  const saved = await page.evaluate(() => (window.__hc as unknown as { game: { snapshot(): { data?: { advancements?: { done: Record<string, number> } } } } }).game.snapshot().data?.advancements?.done ?? {});
  expect(Object.keys(saved)).toEqual(expect.arrayContaining(['surface/root', 'surface/workbench', 'mining/root']));
  expect(errors).toEqual([]);
});
