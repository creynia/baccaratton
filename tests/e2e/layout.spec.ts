// Quality bars (architecture 2.5): axe with no serious/critical issues, tap targets, Deal in view.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { inViewport, openScene } from './helpers';

async function axe(page: import('@playwright/test').Page, what: string) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    ),
    what,
  ).toEqual([]);
}

test('axe: sandbox, with the EV sheet open', async ({ page }) => {
  await page.goto('/#/play?seed=1&speed=instant');
  await page.locator('[data-hit="banker"]').click();
  await page.locator('[data-action="deal"]').click();
  await axe(page, 'sandbox after a hand');
  await page.locator('[data-action="ev"]').click();
  await axe(page, 'EV sheet');
});

test('axe: a lesson with a scene at a predict step', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.__baccaratton?.store?.updateSettings({ animationSpeed: 'instant' }),
  );
  const t = await openScene(page, 'banker-third-card-table', 'l05-s1');
  await t.locator('[data-action="deal"]').click();
  await expect(t.getByTestId('predict-bar')).toBeVisible();
  await axe(page, 'lesson');
});

test('axe: drill and auto-play', async ({ page }) => {
  await page.goto('/#/drill');
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await axe(page, 'drill');
  await page.goto('/#/play?system=paroli');
  await expect(page.getByTestId('auto-play')).toBeVisible();
  await axe(page, 'auto-play');
});

test('every visible tap target is at least 44 × 44', async ({ page }) => {
  await page.goto('/#/play?seed=1&speed=instant');
  const small = await page.locator('[data-hit]').evaluateAll((els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { hit: e.getAttribute('data-hit'), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((x) => x.w < 43.5 || x.h < 43.5),
  );
  expect(small).toEqual([]);
});

test('Deal is visible on first load', async ({ page }) => {
  await page.goto('/#/play?seed=1');
  expect(await inViewport(page, page.locator('[data-action="deal"]'))).toBe(true);
});
