// Performance budget (architecture 4.5), mobile project with a 4× CPU throttle. Each figure is
// the median of several runs, measured from the click to the DOM change it causes (the exact EV
// recompute plus the render, no frame wait).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

async function clickToMutation(page: Page, click: string): Promise<number> {
  return page.evaluate(
    (click) =>
      new Promise<number>((resolve) => {
        const target = document.querySelector('[data-testid="simulator"]')!;
        const mo = new MutationObserver(() => {
          mo.disconnect();
          resolve(performance.now() - t0);
        });
        mo.observe(target, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        const t0 = performance.now();
        document.querySelector(click)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }),
    click,
  );
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const fmt = (xs: number[]) => xs.map((t) => t.toFixed(1)).join(', ');

test('EV preview: a chip on a spot updates every badge and the slip EV (< 30 ms)', async ({
  page,
}) => {
  await page.goto('/#/play?seed=1&speed=instant');
  await page.locator('[data-hit="banker"]').waitFor();
  const times: number[] = [];
  for (let i = 0; i < 7; i++)
    times.push(await clickToMutation(page, `[data-hit="${i % 2 ? 'player' : 'banker'}"]`));
  console.log('EV preview ms (4x throttle):', fmt(times));
  expect(median(times)).toBeLessThan(30);
});

test('Shoe tracker on: the EV sheet with the exact current-shoe line (< 30 ms)', async ({
  page,
}) => {
  await page.goto('/#/play?seed=1&speed=instant');
  await page.locator('[data-action="shoe-tracker"]').click();
  for (let i = 0; i < 5; i++) await page.locator('[data-action="deal"]').click();
  await page.locator('[data-hit="banker"]').click();
  const times: number[] = [];
  for (let i = 0; i < 7; i++) {
    times.push(await clickToMutation(page, '[data-action="ev"]')); // open
    await expect(page.getByTestId('tracker-line-banker')).toBeVisible();
    await page.locator('[data-action="close-ev"]').click();
  }
  console.log('EV sheet + tracker ms (4x throttle):', fmt(times));
  expect(median(times)).toBeLessThan(30);
});

test('Deal → settle at instant speed (< 40 ms with the full render)', async ({ page }) => {
  await page.goto('/#/play?seed=1&speed=instant');
  await page.locator('[data-hit="banker"]').click();
  const times: number[] = [];
  for (let i = 0; i < 7; i++) times.push(await clickToMutation(page, '[data-action="deal"]'));
  console.log('deal ms (4x throttle):', fmt(times));
  expect(median(times)).toBeLessThan(40);
});

test('no long task over 50 ms while betting and dealing (after a first, warm-up hand)', async ({
  page,
}) => {
  await page.goto('/#/play?seed=1&speed=instant');
  // The first hand compiles the engine's code paths (≈ 70 ms at 4×); budgets apply after it.
  await page.locator('[data-action="deal"]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { __long: number[] }).__long = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        (window as unknown as { __long: number[] }).__long.push(e.duration);
    }).observe({ type: 'longtask' });
  });
  // In-page clicks: Playwright's own actionability checks would show up as long tasks.
  await page.evaluate(async () => {
    const click = (sel: string) =>
      document.querySelector(sel)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const idle = () => new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 5; i++) {
      click('[data-hit="banker"]');
      await idle();
      click('[data-action="deal"]');
      await idle();
    }
  });
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  console.log('long tasks (4x throttle):', fmt(long));
  expect(long.filter((d) => d > 50)).toEqual([]);
});
