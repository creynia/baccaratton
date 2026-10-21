// Screenshots of the real app for docs/screenshots (portrait 390×844 and landscape 844×390, light
// and dark). Opt-in: SCREENSHOTS=1 npm run test:e2e -- screenshots
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openScene, settled, sim } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');

const landscape = (page: Page) =>
  (page.viewportSize()?.width ?? 0) > (page.viewportSize()?.height ?? 0);
test.use({ deviceScaleFactor: 2 });
const THEMES = ['light', 'dark'] as const;

async function prepare(page: Page, theme: (typeof THEMES)[number]) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() =>
    window.__baccaratton?.store?.updateSettings({ animationSpeed: 'instant' }),
  );
}
async function shot(page: Page, name: string, theme: string) {
  const orient =
    (page.viewportSize()?.width ?? 0) > (page.viewportSize()?.height ?? 0)
      ? 'landscape'
      : 'portrait';
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.screenshot({ path: `docs/screenshots/${name}-${orient}-${theme}.png` });
}
const top = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    el?.scrollIntoView({ block: 'start' });
    // Landscape: the rail scrolls inside the table; keep the whole table on screen.
    const table = el?.closest('.sim-table-landscape');
    if (table) window.scrollTo(0, table.getBoundingClientRect().top + window.scrollY - 4);
  }, sel);

for (const theme of THEMES) {
  test.describe(theme, () => {
    test.beforeEach(({ page: _page }, info) => {
      test.skip(info.project.name === 'desktop', 'phone sizes only');
    });

    test('table with the EV sheet open', async ({ page }) => {
      await prepare(page, theme);
      // Banker wins 7 to 5; then a new slip ($25 Banker + $5 Tie) with the sheet open.
      await page.goto('/#/play?seed=8&shoe=Kh,4s,2d,3h,3c&speed=instant');
      const t = sim(page);
      await t.locator('[data-chip="2500"]').click();
      await t.locator('[data-hit="banker"]').click();
      await t.locator('[data-action="deal"]').click();
      await settled(t);
      await t.locator('[data-hit="banker"]').click();
      await t.locator('[data-chip="500"]').click();
      await t.locator('[data-hit="tie"]').click();
      await t.getByRole('button', { name: /Bet it anyway/ }).click();
      await t.locator('[data-action="ev"]').click();
      await expect(page.getByTestId('ev-sheet')).toBeVisible();
      await shot(page, 'table-ev', theme);
      await page.locator('[data-action="close-ev"]').click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'table-result', theme);
    });

    test('a predict step in a lesson', async ({ page }) => {
      await prepare(page, theme);
      const t = await openScene(page, 'banker-third-card-table', 'l05-s1');
      await t.locator('[data-action="deal"]').click();
      await expect(t.getByTestId('predict-bar')).toBeVisible();
      await top(
        page,
        landscape(page)
          ? '[data-scene="l05-s1"] [data-testid="simulator"]'
          : '[data-scene="l05-s1"] [data-testid="step-panel"]',
      );
      await shot(page, 'predict', theme);
      await t.getByTestId('predict-bar').locator('[data-answer="Draw"]').click();
      await settled(t);
      await top(
        page,
        landscape(page)
          ? '[data-scene="l05-s1"] [data-testid="simulator"]'
          : '[data-scene="l05-s1"] [data-testid="step-panel"]',
      );
      await shot(page, 'predict-feedback', theme);
    });

    test('roads and the Shoe tracker after 40 hands', async ({ page }) => {
      await prepare(page, theme);
      await page.goto('/#/play?seed=21&speed=instant');
      const t = sim(page);
      await t.locator('[data-action="shoe-tracker"]').click();
      for (let i = 0; i < 40; i++) {
        await t.locator('[data-action="deal"]').click();
        await settled(t);
      }
      await top(page, '[data-testid="scoreboard"]');
      await shot(page, 'roads', theme);
      await top(page, '[data-testid="shoe-tracker"]');
      await shot(page, 'tracker', theme);
    });

    test('auto-play compare chart (lesson 19)', async ({ page }) => {
      test.setTimeout(120_000);
      await prepare(page, theme);
      await openScene(page, 'betting-systems', 'l19-s1');
      await page.locator('[data-scene="l19-s1"] [data-testid="auto-run"]').click();
      await expect(
        page.locator('[data-scene="l19-s1"] [data-testid="auto-play-result"]'),
      ).toBeVisible({
        timeout: 90_000,
      });
      await top(page, '[data-scene="l19-s1"] [data-testid="bankroll-chart"]');
      await shot(page, 'autoplay', theme);
    });

    test('Drill and a lesson page', async ({ page }) => {
      await prepare(page, theme);
      await page.goto('/#/drill?mode=banker');
      await page
        .getByTestId('drill-spot')
        .getByRole('group', { name: 'Your answer' })
        .getByRole('button')
        .first()
        .click();
      await expect(page.getByTestId('drill-result')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'drill', theme);
      await page.goto('/#/learn/expected-value');
      await expect(page.locator('h1').first()).toBeVisible();
      await shot(page, 'lesson', theme);
    });
  });
}
