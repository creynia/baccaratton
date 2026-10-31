import { expect, test } from '@playwright/test';

test('home renders a visible h1 and the title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page).toHaveTitle(/\| baccaratton$/);
});

test('the four tabs are there and navigate (Learn, Play, Drill, More)', async ({ page }) => {
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Tabs' });
  const top = page.getByRole('navigation', { name: 'Main' });
  const nav = (await bar.isVisible()) ? bar : top;
  await expect(nav.getByRole('link')).toHaveCount(4);
  for (const name of ['Learn', 'Play', 'Drill', 'More']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }
});

test('no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
