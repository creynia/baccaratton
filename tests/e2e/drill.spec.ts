// Drill (D11, D29): a Player and a Banker spot, the streak, "See the chart" and "Play it out".
import { expect, test } from '@playwright/test';

async function answerRight(page: import('@playwright/test').Page): Promise<void> {
  // Try each option; a wrong pick still shows the right answer, so read it back.
  const spot = page.getByTestId('drill-spot');
  await spot.getByRole('group', { name: 'Your answer' }).getByRole('button').first().click();
}

test('answer a Player and a Banker spot; the streak and the chart link work', async ({ page }) => {
  await page.goto('/#/drill?mode=player');
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await expect(page.getByTestId('drill-spot')).toContainText('Does the Player draw?');
  await answerRight(page);
  await expect(page.getByTestId('drill-result')).toBeVisible();
  await page.goto('/#/drill?mode=banker');
  await expect(page.getByTestId('drill-spot')).toContainText('Does the Banker draw?');
  await answerRight(page);
  const result = page.getByTestId('drill-result');
  await expect(result).toBeVisible();
  await expect(page.getByTestId('streak')).toHaveText(/\d+/);
  const correct = await result.getAttribute('data-correct');
  if (correct === 'false') {
    await result.getByRole('link', { name: 'See the chart' }).click();
    await expect(page).toHaveURL(/#\/rules\?highlight=b\d\/(p\d|s)/);
  } else {
    await result.getByRole('link', { name: 'Play it out' }).click();
    await expect(page).toHaveURL(/#\/play\?shoe=/);
    await expect(page.getByTestId('simulator')).toBeVisible();
    await page.locator('[data-action="deal"]').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-hands', '1');
  }
});

test('"Play it out" deals the spot on the table', async ({ page }) => {
  await page.goto('/#/drill?mode=banker');
  await answerRight(page);
  const link = page.getByTestId('drill-result').getByRole('link', { name: 'Play it out' });
  await link.click();
  await expect(page.getByTestId('simulator')).toBeVisible();
  await expect(page.locator('.sim-toast-bad')).toHaveCount(0);
  await page.locator('[data-action="deal"]').click();
  await expect(page.getByTestId('simulator')).toHaveAttribute('data-hands', '1');
});
