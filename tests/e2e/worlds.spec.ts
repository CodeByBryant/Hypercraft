import { expect, test } from '@playwright/test';
import './util';

// Title -> create world with a seed -> play -> edit -> save -> reload -> edit persisted.
test('create a seeded world, edit it, and the edit survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Keep software GL fast: low fixed internal resolution, small render distance.
  await page.addInitScript(() => {
    localStorage.setItem('hypercraft.settings.v1', JSON.stringify({ resolution: 180, renderDistance: 3, touch: 'off' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Singleplayer' }).click();
  await page.getByRole('button', { name: 'Create new world' }).click();
  await page.locator('label:has-text("World name") input').fill('E2E World');
  await page.locator('label:has-text("Seed") input[type=text]').fill('e2e seed');
  await expect(page.getByText(/seed number \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Create world' }).click();

  await page.waitForURL(/\?world=/);
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(120_000));
  await page.evaluate(() => window.__hc.idle(240_000));
  const seed = await page.evaluate(() => (window.__hc as unknown as { game: { seed: number } }).game.seed);
  expect(seed).toBeGreaterThan(0);

  // Hover (creative flight) and place glass on the ground below us.
  await page.evaluate(() => {
    window.__hc.setMode('creative');
    window.__hc.setFlying(true);
    const s = window.__hc.state();
    window.__hc.teleport(s.pos[0]!, s.pos[1]! + 2.5, s.pos[2]!, s.pos[3]!);
    window.__hc.setView({ pitch: -89 });
  });
  await page.evaluate(() => window.__hc.frames(3));
  const t = await page.evaluate(() => window.__hc.target());
  expect(t).not.toBeNull();
  expect(await page.evaluate(() => window.__hc.placeTarget('glass'))).toBe(true);
  const pos = [t!.x, t!.y + 1, t!.z, t!.w];
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y!, z!, w!), pos)).toBe('glass');
  await page.evaluate(() => (window.__hc as unknown as { game: { saveAll(): Promise<void> } }).game.saveAll());

  // Reload the same world: the column comes back from IndexedDB, not the generator.
  await page.reload();
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(120_000));
  await page.evaluate(() => window.__hc.idle(240_000));
  expect(await page.evaluate(([x, y, z, w]) => window.__hc.blockAt(x!, y!, z!, w!), pos)).toBe('glass');
  const fromSave = await page.evaluate(() => (window.__hc as unknown as { game: { streamer: { loadedFromSave: number } } }).game.streamer.loadedFromSave);
  expect(fromSave).toBeGreaterThan(0);

  // The world list shows it with its seed.
  await page.goto('/');
  await page.getByRole('button', { name: 'Singleplayer' }).click();
  await expect(page.getByText('E2E World')).toBeVisible();
  await expect(page.getByText(/Seed e2e seed/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('touch controls appear on a phone-sized touch screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('hypercraft.settings.v1', JSON.stringify({ resolution: 180, renderDistance: 2 }));
  });
  await page.goto('/?world=ephemeral');
  // No stored world with that id: the title screen shows instead.
  await page.getByRole('button', { name: 'Singleplayer' }).click();
  await page.getByRole('button', { name: 'Create new world' }).click();
  await page.getByRole('button', { name: 'Create world' }).click();
  await page.waitForURL(/\?world=/);
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Resume' }).tap();
  await expect(page.locator('.touch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jump' })).toBeVisible();
  await expect(page.getByRole('button', { name: '◀ Kata' })).toBeVisible();
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(120_000));
  await page.evaluate(() => window.__hc.idle(240_000));
  await page.evaluate(() => window.__hc.renderNow());
  await page.screenshot({ path: 'test-results/touch-controls.png' });
  await ctx.close();
});
