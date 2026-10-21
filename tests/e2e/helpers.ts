// Shared e2e helpers (integration).
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** The table in the page (sandbox) or inside one lesson scene. */
export function sim(page: Page, sceneId?: string): Locator {
  return sceneId
    ? page.locator(`[data-scene="${sceneId}"] [data-testid="simulator"]`)
    : page.getByTestId('simulator').first();
}

/** Waits until the reveal (cards + held-back result) is over. */
export async function settled(table: Locator): Promise<void> {
  await expect(table).toHaveAttribute('data-revealing', 'false', { timeout: 15_000 });
}

export async function bankroll(table: Locator): Promise<string> {
  return (await table.getByTestId('bankroll').textContent()) ?? '';
}

/** Scrolls a lesson scene into view so it mounts (the table loads lazily). */
export async function openScene(page: Page, lessonId: string, sceneId: string): Promise<Locator> {
  await page.goto(`/#/learn/${lessonId}`);
  const card = page.locator(`[data-scene="${sceneId}"]`).first();
  await card.scrollIntoViewIfNeeded();
  const table = sim(page, sceneId);
  await expect(table).toBeVisible();
  return table;
}

export async function noHorizontalScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** The element's box lies inside the viewport. */
export async function inViewport(page: Page, el: Locator): Promise<boolean> {
  const box = await el.boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) return false;
  return (
    box.y >= 0 &&
    box.y + box.height <= vp.height + 1 &&
    box.x >= 0 &&
    box.x + box.width <= vp.width + 1
  );
}

/** Presses Tab until the focused element matches `selector` (real keyboard navigation). */
export async function tabTo(page: Page, selector: string, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** The element is on screen and nothing (a sticky bar, the tab bar) covers its centre. */
export async function uncovered(el: Locator): Promise<boolean> {
  return el.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === e || e.contains(hit));
  });
}
