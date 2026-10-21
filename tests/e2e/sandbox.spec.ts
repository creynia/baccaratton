// The Play sandbox (simulator.md section 7.5 items 1-5, 9): EV before Deal, the Sucker second tap
// and "Use this", EZ, roads and the shoe, the tracker, persistence, keyboard betting, Deal in view.
import { expect, test } from '@playwright/test';
import { bankroll, inViewport, noHorizontalScroll, settled, sim } from './helpers';

// Player K 2 3 = 5, Banker 4 3 = 7 stands: Banker wins 7 to 5.
const BANKER_WINS = 'Kh,4s,2d,3h,3c';

test('Banker $25: the sheet shows 1.06% "Good bet" before Deal, and a Banker win pays $23.75', async ({
  page,
}) => {
  await page.goto(`/#/play?seed=5&shoe=${BANKER_WINS}&speed=instant`);
  const t = sim(page);
  await t.locator('[data-chip="2500"]').click();
  await t.locator('[data-hit="banker"]').click();
  await expect(t.locator('[data-action="deal"]')).toContainText('Slip $25');
  await expect(t.locator('[data-action="deal"]')).toContainText('EV');
  await t.locator('[data-action="ev"]').click();
  const row = page.getByTestId('ev-row-banker');
  await expect(row).toContainText('1.06%');
  await expect(row).toContainText('Good bet');
  await expect(row).toContainText('Lowest edge on this table');
  await page.locator('[data-action="close-ev"]').click();
  expect(await bankroll(t)).toBe('$475.00');
  await t.locator('[data-action="deal"]').click();
  await settled(t);
  expect(await bankroll(t)).toBe('$523.75');
  await expect(t.getByTestId('settle-toast')).toContainText('Banker wins');
  await expect(t.getByTestId('settle-toast')).toContainText('$1.25 commission');
});

test('the result waits for the cards: bankroll and roads update only after the reveal', async ({
  page,
}) => {
  await page.goto(`/#/play?seed=5&shoe=${BANKER_WINS}&speed=normal`);
  const t = sim(page);
  await t.locator('[data-chip="2500"]').click();
  await t.locator('[data-hit="banker"]').click();
  await t.locator('[data-action="deal"]').click();
  await expect(t).toHaveAttribute('data-revealing', 'true');
  expect(await bankroll(t)).toBe('$475.00');
  await expect(t.getByTestId('settle-toast')).toHaveCount(0);
  await settled(t);
  expect(await bankroll(t)).toBe('$523.75');
  await expect(t.getByTestId('roads-text')).toContainText('Banker 1');
});

test('Deal and the primary action stay in view after a hand', async ({ page }) => {
  await page.goto('/#/play?seed=11&speed=instant');
  const t = sim(page);
  await t.locator('[data-hit="banker"]').click();
  await t.locator('[data-action="deal"]').click();
  await settled(t);
  const deal = t.locator('[data-action="deal"]');
  await expect(deal).toContainText('Rebet & Deal');
  expect(await inViewport(page, deal)).toBe(true);
  await deal.click();
  await settled(t);
  expect(await inViewport(page, deal)).toBe(true);
  expect(Number(await t.getAttribute('data-hands'))).toBe(2);
});

test('Tie needs a second tap; "Use this" moves the stake to Banker', async ({ page }) => {
  await page.goto('/#/play?seed=3&speed=instant');
  const t = sim(page);
  await t.locator('[data-chip="500"]').click();
  await t.locator('[data-hit="tie"]').click();
  await expect(t.locator('.sim-alt').first()).toContainText('Tie loses');
  expect(await bankroll(t)).toBe('$500.00'); // nothing placed yet
  await t
    .getByRole('button', { name: /Banker instead|Use this/ })
    .first()
    .click();
  expect(await bankroll(t)).toBe('$495.00');
  await expect(t.locator('[data-action="deal"]')).toContainText('Slip $5');
  // Second tap: Bet it anyway.
  await t.locator('[data-hit="tie"]').click();
  await t.getByRole('button', { name: /Bet it anyway/ }).click();
  expect(await bankroll(t)).toBe('$490.00');
});

test('EZ: Dragon 7 and Panda 8 appear; a 3-card Banker 7 pushes the Banker bet', async ({
  page,
}) => {
  // Player K 6 = 6 stands; Banker 2 2 = 4 draws a 3: 7 with three cards.
  await page.goto('/#/play?variant=ez&seed=2&shoe=Ks,2c,6d,2h,3s&speed=instant');
  const t = sim(page);
  await expect(t.locator('[data-hit="dragon-7"]')).toBeVisible();
  await expect(t.locator('[data-hit="panda-8"]')).toBeVisible();
  await t.locator('[data-chip="2500"]').click();
  await t.locator('[data-hit="banker"]').click();
  await t.locator('[data-action="deal"]').click();
  await settled(t);
  expect(await bankroll(t)).toBe('$500.00');
  await expect(t.getByTestId('settle-toast')).toContainText(/push/i);
});

test('roads fill, the Shoe tracker updates, and a reload resumes the same shoe', async ({
  page,
}) => {
  await page.goto('/#/play');
  const t = sim(page);
  await page.evaluate(() => {
    // Instant speed for the test, without a preset query (a preset never saves the session).
    const s = window.__baccaratton?.store;
    s?.updateSettings({ animationSpeed: 'instant' });
  });
  await t.locator('[data-action="shoe-tracker"]').click();
  const tracker = page.getByTestId('shoe-tracker');
  await expect(tracker).toContainText('Full shoe');
  for (let i = 0; i < 10; i++) {
    await t.locator('[data-action="deal"]').click();
    await settled(t);
  }
  await expect(t.locator('[data-road="bead"] .sim-bead')).toHaveCount(10);
  await expect(tracker).toContainText('cards left in this shoe');
  const left = await t.getByTestId('shoe-meter').textContent();
  const roads = await t.getByTestId('roads-text').textContent();
  await page.evaluate(() => window.__baccaratton?.store?.flush());
  await page.reload();
  const t2 = sim(page);
  await expect(t2.getByTestId('shoe-meter')).toHaveText(left!);
  await expect(t2.getByTestId('roads-text')).toHaveText(roads!);
  await expect(t2).toHaveAttribute('data-hands', '10');
});

test('keyboard: Tab to a spot and press Enter to bet', async ({ page }) => {
  await page.goto('/#/play?seed=4&speed=instant');
  const t = sim(page);
  const spot = t.locator('[data-hit="player"]');
  await spot.focus();
  await page.keyboard.press('Enter');
  await expect(t.locator('[data-action="deal"]')).toContainText('Slip $25');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(spot).toBeFocused();
});

test('auto-play: Martingale vs flat Banker on the same cards, with exact and simulated labels', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/#/play?system=martingale&seed=1&speed=instant');
  const ap = page.getByTestId('auto-play');
  await expect(ap).toBeVisible();
  await ap.getByTestId('auto-hands').selectOption('720');
  await ap.getByTestId('auto-sessions').selectOption('100');
  await ap.getByRole('checkbox', { name: /Flat Banker/ }).check();
  await ap.getByTestId('auto-run').click();
  const res = page.getByTestId('auto-play-result');
  await expect(res).toBeVisible({ timeout: 60_000 });
  await expect(ap).toContainText(/simulated/i);
  await expect(ap).toContainText(/exact/i);
  await expect(res.locator('svg').first()).toBeVisible();
});

test('a long shoe never widens the page (the roads scroll inside their strip)', async ({
  page,
}) => {
  await page.goto('/#/play?seed=21&speed=instant');
  const t = sim(page);
  for (let i = 0; i < 45; i++) await t.locator('[data-action="deal"]').click();
  await expect(t).toHaveAttribute('data-hands', '45');
  expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
});
