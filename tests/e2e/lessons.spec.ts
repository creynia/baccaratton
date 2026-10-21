// Lessons drive the real scene runner (simulator.md section 7.5 item 6, architecture 2.3).
import { expect, test } from '@playwright/test';
import { openScene, settled } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.__baccaratton?.store?.updateSettings({ animationSpeed: 'instant' }),
  );
});

test('a staged reveal: the deal pauses, a wrong call shows the rule row, the scene goes on', async ({
  page,
}) => {
  const t = await openScene(page, 'banker-third-card-table', 'l05-s1');
  await expect(t.getByTestId('step-panel')).toContainText('Step 1 of 10');
  await t.locator('[data-action="deal"]').click();
  const bar = t.getByTestId('predict-bar');
  await expect(bar).toContainText('Does the Banker draw?');
  // Banker 3 against a Player third card of 8 stands: answer Draw (wrong).
  await bar.locator('[data-answer="Draw"]').click();
  const fb = t.getByTestId('predict-feedback');
  await expect(fb).toHaveAttribute('data-correct', 'false');
  await expect(fb.getByTestId('rule-row')).toContainText(
    "Banker 3 draws unless the Player's third card is an 8",
  );
  await expect(fb.getByRole('link', { name: 'See the chart' })).toHaveAttribute(
    'href',
    '#/rules?highlight=b3/p8',
  );
  await settled(t);
  await expect(t.getByTestId('step-panel')).toContainText('Step 2 of 10');
  await t.locator('[data-action="next"]').click();
  await expect(t.getByTestId('step-panel')).toContainText('Step 3 of 10');
});

test('a whole scene completes and the lesson records it', async ({ page }) => {
  const t = await openScene(page, 'naturals-and-player-rule', 'l03-s1');
  await t.locator('[data-action="deal"]').click();
  await t.getByTestId('predict-bar').locator('[data-answer="Stand"]').click();
  await expect(t.getByTestId('predict-feedback')).toHaveAttribute('data-correct', 'true');
  await settled(t);
  await t.locator('[data-action="next"]').click();
  await expect(t.getByTestId('step-panel')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('[data-scene="l03-s1"] .scene-head')).toContainText('Done');
});

test('betting steps lock Deal; the commission line completes l07-s1', async ({ page }) => {
  const t = await openScene(page, 'settling-bets', 'l07-s1');
  await expect(t.locator('[data-action="deal"]')).toBeDisabled();
  await t.locator('[data-chip="500"]').click();
  for (let i = 0; i < 4; i++) await t.locator('[data-hit="banker"]').click();
  await expect(t.getByTestId('step-panel')).toContainText('Step 2 of 3');
  await t.locator('[data-action="deal"]').click();
  await settled(t);
  await expect(t.getByTestId('step-panel')).toContainText('Step 3 of 3');
  await t.locator('[data-hit="commission"]').click();
  await expect(t.getByTestId('commission-explainer')).toBeVisible();
  await expect(t.getByTestId('step-panel')).toHaveAttribute('data-done', 'true');
});

test('a gated action shows the step hint', async ({ page }) => {
  const t = await openScene(page, 'welcome', 'l01-s2');
  await t.locator('[data-chip="500"]').click();
  await t.locator('[data-hit="banker"]').click();
  await expect(t.getByTestId('step-hint')).toBeVisible();
  await t.locator('[data-hit="player"]').click();
  await t.locator('[data-hit="player"]').click();
  await expect(t.getByTestId('step-panel')).toContainText('Step 2 of 3');
});

test('an auto-play scene completes on Run (l09)', async ({ page }) => {
  test.setTimeout(90_000);
  const t = await openScene(page, 'banker-vs-player', 'l09-s1');
  await page.locator('[data-scene="l09-s1"] [data-testid="auto-run"]').click();
  await expect(t.getByTestId('step-panel')).toContainText('Step 2 of 2', { timeout: 60_000 });
});
