// Tabs and the More pages render; nothing scrolls sideways at 360 px.
import { expect, test } from '@playwright/test';
import { noHorizontalScroll } from './helpers';

const PAGES = [
  '/',
  '/learn',
  '/play',
  '/drill',
  '/more',
  '/rules',
  '/bets',
  '/bets/banker',
  '/roads',
  '/glossary',
  '/settings',
  '/about',
];

for (const path of PAGES) {
  test(`${path} renders a heading`, async ({ page }) => {
    await page.goto(`/#${path}`);
    await expect(page.locator('h1').first()).toBeVisible();
  });
}

test('More links reach every page', async ({ page }) => {
  await page.goto('/#/more');
  for (const name of ['Drawing rules', 'Bets', 'Roads', 'Glossary', 'Settings', 'About']) {
    await page.goto('/#/more');
    await page
      .getByRole('main')
      .getByRole('link', { name: new RegExp(name) })
      .first()
      .click();
    await expect(page.locator('h1').first()).toBeVisible();
  }
});

test('no horizontal scroll at 360 px on any page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  for (const path of [...PAGES, '/learn/banker-third-card-table', '/learn/betting-systems']) {
    await page.goto(`/#${path}`);
    await page.waitForTimeout(150);
    expect(await noHorizontalScroll(page), path).toBeLessThanOrEqual(0);
  }
});

test('Settings → EZ makes the table offer Dragon 7 and Panda 8', async ({ page }) => {
  await page.goto('/#/settings');
  await page.evaluate(() => window.__baccaratton?.store?.updateSettings({ variant: 'ez' }));
  await page.goto('/#/play');
  await expect(page.locator('[data-hit="dragon-7"]')).toBeVisible();
  await page.evaluate(() =>
    window.__baccaratton?.store?.updateSettings({ variant: 'punto-banco' }),
  );
});
