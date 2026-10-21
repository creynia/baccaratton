// Drill (D11, D29): answer from the cards on the spot (by the engine's own rules), the streak,
// "See the chart", and "Play it out" dealing the same cards on the table.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  bankerDraws,
  cardName,
  cardValue,
  FULL_DECK,
  handTotal,
  playerDraws,
} from '../../src/sim/engine';

const BY_NAME = new Map(FULL_DECK.map((c) => [cardName(c), c]));

async function sideCards(spot: Locator, side: 'player' | 'banker'): Promise<number[]> {
  const label = (await spot.locator(`.side-${side} .cards`).getAttribute('aria-label')) ?? '';
  return label
    .replace(/ \(total \d\)$/, '')
    .split(', ')
    .map((n) => {
      const c = BY_NAME.get(n);
      if (c === undefined) throw new Error(`unknown card "${n}"`);
      return c;
    });
}

/** The right answer, from the tableau (the engine's playerDraws / bankerDraws). */
async function rightAnswer(
  page: Page,
): Promise<{ answer: string; player: number[]; banker: number[] }> {
  const spot = page.getByTestId('drill-spot');
  const player = await sideCards(spot, 'player');
  const banker = await sideCards(spot, 'banker');
  const p2 = handTotal(player.slice(0, 2));
  const b2 = handTotal(banker.slice(0, 2));
  const q = (await spot.locator('.drill-q').textContent()) ?? '';
  const draws = q.includes('Player')
    ? playerDraws(p2, b2).draws
    : bankerDraws(b2, p2, player.length === 3 ? cardValue(player[2]!) : null).draws;
  return { answer: draws ? 'Draw' : 'Stand', player, banker };
}

async function answer(page: Page, text: string) {
  await page
    .getByTestId('drill-spot')
    .getByRole('group', { name: 'Your answer' })
    .getByRole('button', { name: text, exact: true })
    .click();
}

test('a right Player call and a right Banker call grow the streak', async ({ page }) => {
  await page.goto('/#/drill?mode=player');
  await expect(page.getByTestId('drill-spot')).toContainText('Does the Player draw?');
  const before = Number(await page.getByTestId('streak').textContent());
  await answer(page, (await rightAnswer(page)).answer);
  await expect(page.getByTestId('drill-result')).toHaveAttribute('data-correct', 'true');
  await page.goto('/#/drill?mode=banker');
  await expect(page.getByTestId('drill-spot')).toContainText('Does the Banker draw?');
  await answer(page, (await rightAnswer(page)).answer);
  await expect(page.getByTestId('drill-result')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId('streak')).toHaveText(String(before + 2));
});

test('a wrong Banker call shows the rule and "See the chart" highlights its cell', async ({
  page,
}) => {
  await page.goto('/#/drill?mode=banker');
  const { answer: right } = await rightAnswer(page);
  await answer(page, right === 'Draw' ? 'Stand' : 'Draw');
  const result = page.getByTestId('drill-result');
  await expect(result).toHaveAttribute('data-correct', 'false');
  await expect(page.getByTestId('streak')).toHaveText('0');
  await result.getByRole('link', { name: 'See the chart' }).click();
  await expect(page).toHaveURL(/#\/rules\?highlight=b\d\/(p\d|s)/);
  await expect(page.locator('.is-hl, [aria-current]').first()).toBeVisible();
});

test('"Play it out" deals the spot\'s cards on the table', async ({ page }) => {
  await page.goto('/#/drill?mode=banker');
  const { answer: right, player, banker } = await rightAnswer(page);
  await answer(page, right);
  await page.getByTestId('drill-result').getByRole('link', { name: 'Play it out' }).click();
  const table = page.getByTestId('simulator');
  await expect(table).toBeVisible();
  await expect(page.locator('.sim-toast-bad')).toHaveCount(0);
  await table.locator('[data-action="deal"]').click();
  await expect(table).toHaveAttribute('data-hands', '1');
  await expect(table).toHaveAttribute('data-revealing', 'false', { timeout: 15_000 });
  const names = async (side: string) =>
    table
      .locator(`[data-hand="${side}"] [role="img"]`)
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute('aria-label')?.replace(/, third card$/, '') ?? ''),
      );
  const felt = { player: await names('player'), banker: await names('banker') };
  expect(felt.player.slice(0, player.length)).toEqual(player.map(cardName));
  expect(felt.banker.slice(0, banker.length)).toEqual(banker.map(cardName));
});
