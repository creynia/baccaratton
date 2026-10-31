import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const file = path.resolve('dist-single/baccaratton.html');

test('single-file build opens from file:// with no failed requests or errors', async ({ page }) => {
  test.skip(!existsSync(file), 'run npm run build:single first');
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => failed.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') failed.push(`console: ${m.text()}`);
  });
  await page.goto(pathToFileURL(file).href);
  await expect(page).toHaveTitle(/\| baccaratton$/);
  await expect(page.locator('h1').first()).toBeVisible();

  // The test hook says this is the offline copy.
  const hook = await page.evaluate(() => window.__baccaratton?.singleFile);
  expect(hook).toBe(true);

  // No service worker is registered by the offline copy.
  const sw = await page.evaluate(
    () => 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  );
  expect(sw).toBe(false);
  expect(failed).toEqual([]);
});

test('hosted build is not the single-file build', async ({ page }) => {
  await page.goto('/');
  const hook = await page.evaluate(() => window.__baccaratton?.singleFile);
  expect(hook).toBe(false);
});
