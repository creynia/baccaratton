// table-ui gallery (src/sim/ui/gallery.html, dev-only): keyboard access to the felt, Skip, and
// axe on the table components. The gallery is not in the build, so this spec serves it with its
// own Vite dev server on a free port.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

let server: ViteDevServer;
let base = '';

test.beforeAll(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    logLevel: 'error',
    server: { port: 0, strictPort: false, hmr: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite dev server did not start');
  base = url.replace(/\/$/, '');
});
test.afterAll(async () => {
  await server?.close();
});

const gallery = (q: string) => `${base}/src/sim/ui/gallery.html?${q}`;

test('a bet spot is reachable with Tab and placed with Enter', async ({ page }) => {
  await page.goto(gallery('scene=play&view=portrait'));
  const banker = page.locator('[data-hit="banker"]');
  await expect(banker).toHaveAttribute('aria-label', /^Banker, no bet\./);
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(
      () => document.activeElement?.getAttribute('data-hit') === 'banker',
    );
  }
  expect(found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(banker).toHaveAttribute('aria-label', /^Banker, \$25 on it\./);
});

test('Skip shows while a hand animates; Escape skips', async ({ page }) => {
  await page.goto(gallery('scene=play&view=portrait&speed=normal'));
  await page.locator('[data-hit="banker"]').click();
  await page.getByRole('button', { name: /^Deal/ }).click();
  const skip = page.getByRole('button', { name: 'Skip' });
  await expect(skip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(skip).toHaveCount(0);
  await expect(page.getByTestId('settle-toast')).toBeVisible();
});

test('Deal stays visible after a hand at 390 × 844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gallery('scene=play&view=portrait'));
  await page.locator('[data-hit="banker"]').click();
  await page.getByRole('button', { name: /^Deal/ }).click();
  await expect(page.getByTestId('settle-toast')).toBeVisible();
  await expect(page.getByRole('button', { name: /Deal/ })).toBeInViewport();
});

for (const q of [
  'scene=play&view=portrait',
  'scene=why&view=portrait',
  'scene=result&view=landscape',
  'scene=roads',
  'scene=tableau',
  'scene=tracker',
  'scene=session',
]) {
  test(`axe: no serious or critical issues (${q})`, async ({ page }) => {
    await page.goto(gallery(q));
    await page.waitForTimeout(200);
    const r = await new AxeBuilder({ page }).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
      [],
    );
  });
}
