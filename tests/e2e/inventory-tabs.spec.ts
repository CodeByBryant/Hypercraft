import { expect, test } from '@playwright/test';
import { boot } from './util';

// Creative tabs and recipe book sections; the creative list (900+ items) must open fast
// (each icon used to carry its own copy of a multi-megabyte data: URL and crashed the tab).

test('creative tabs and recipe book sections', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await boot(page, 'res=180&rd=1&seed=tabs', errors);
  await page.evaluate(() => {
    window.__hc.setMode('creative');
    window.__hc.openInventory();
  });
  const t0 = Date.now();
  await page.locator('.inv-tabs button', { hasText: 'All items' }).click();
  await page.waitForSelector('.creative-list .islot');
  const all = await page.evaluate(() => ({
    slots: document.querySelectorAll('.creative-list .islot').length,
    heads: [...document.querySelectorAll('.creative-list .group-head')].map((e) => e.textContent),
    inline: (document.querySelector('.creative-list .icon') as HTMLElement).getAttribute('style') ?? '',
  }));
  const ms = Date.now() - t0;
  expect(all.slots).toBeGreaterThan(800);
  expect(all.heads).toContain('Building Blocks');
  expect(all.heads).toContain('Combat');
  expect(all.inline).not.toContain('data:');
  expect(ms).toBeLessThan(5000);
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? 'test-results/tabs'}/creative.png` });

  // One tab: only its items, no section headers.
  await page.locator('.inv-main .item-tab[data-tab="tools"]').click();
  const tools = await page.evaluate(() => ({ slots: document.querySelectorAll('.creative-list .islot').length, heads: document.querySelectorAll('.creative-list .group-head').length, label: document.querySelector('.inv-main .tab-label')?.textContent }));
  expect(tools.slots).toBeGreaterThan(20);
  expect(tools.slots).toBeLessThan(200);
  expect(tools.heads).toBe(0);
  expect(tools.label).toBe('Tools & Utilities');
  // Search looks through every tab.
  await page.locator('.creative-search').fill('sword');
  const swords = await page.evaluate(() => document.querySelectorAll('.creative-list .islot').length);
  expect(swords).toBeGreaterThanOrEqual(8);

  // Recipe book sections (survival crafting table screen).
  await page.evaluate(() => {
    const hc = window.__hc;
    hc.closeScreen();
    hc.setMode('survival');
    hc.openInventory();
  });
  await page.waitForSelector('.inv-book .item-tab');
  const book = await page.evaluate(() => ({ entries: document.querySelectorAll('.book-list .islot').length, heads: [...document.querySelectorAll('.book-list .group-head')].map((e) => e.textContent) }));
  expect(book.entries).toBeGreaterThan(5);
  expect(book.heads.length).toBeGreaterThan(1);
  await page.locator('.inv-book .item-tab[data-tab="equipment"]').click();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? 'test-results/tabs'}/book.png` });
  const eq = await page.evaluate(() => [...document.querySelectorAll('.book-list .islot')].map((e) => (e as HTMLElement).dataset.item));
  expect(eq.length).toBeGreaterThan(0);
  for (const n of eq) expect(n).toMatch(/pickaxe|axe|shovel|hoe|sword|helmet|chestplate|leggings|boots|bow|arrow|shield|shears|bucket|compass|clock|flint|lead|name_tag|charm|glasses|book|bottle|charge/);
  expect(errors).toEqual([]);
});
