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
  '/sources',
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
  for (const name of [
    'Drawing rules',
    'Bets',
    'Roads',
    'Glossary',
    'Sources',
    'Settings',
    'About',
  ]) {
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
    await expect(page.locator('h1').first()).toBeVisible();
    await expect.poll(() => noHorizontalScroll(page), { message: path }).toBeLessThanOrEqual(0);
  }
});
