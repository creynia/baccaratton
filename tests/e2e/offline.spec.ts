import {
  cpSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { expect, test } from '@playwright/test';

test('PWA works offline after the service worker is installed', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  // Wait until the SW controls the page (clients.claim) so subresources come from the cache.
  await page.waitForFunction('!!navigator.serviceWorker.controller');

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle('baccaratton');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await context.setOffline(false);
});

test('manifest and icons are served', async ({ request }) => {
  const m = await request.get('/manifest.webmanifest');
  expect(m.ok()).toBe(true);
  const json = (await m.json()) as { short_name: string; theme_color: string };
  expect(json.short_name).toBe('baccaratton');
  expect(json.theme_color).toBe('#5c1a2b');
  expect((await request.get('/icons/icon-192.png')).ok()).toBe(true);
});

// Regression: GitHub Pages sends max-age=600. The new SW must precache with cache:'reload',
// else it stores the OLD index.html under the NEW cache name and the app goes blank offline.
test('update within the HTTP max-age window keeps a consistent offline cache', async ({
  page,
  context,
}) => {
  const tmp = mkdtempSync(join(tmpdir(), 'baccaratton-upd-'));
  const a = join(tmp, 'A');
  const b = join(tmp, 'B');
  cpSync('dist', a, { recursive: true });
  cpSync('dist', b, { recursive: true });
  // Build "v2": renamed entry script, new SW version.
  const entry = readdirSync(join(b, 'assets')).find((f) => /^index-.*\.js$/.test(f))!;
  const entry2 = entry.replace(/^index-/, 'index-v2-');
  renameSync(join(b, 'assets', entry), join(b, 'assets', entry2));
  for (const f of ['index.html', 'sw.js']) {
    const p = join(b, f);
    let t = readFileSync(p, 'utf8').split(entry).join(entry2);
    if (f === 'sw.js') t = t.replace(/(PREFIX \+ )"[^"]*"/, '$1"v2v2v2v2v2v2"');
    writeFileSync(p, t);
  }

  let root = a;
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  };
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(root, p);
    if (!existsSync(f) || !statSync(f).isFile()) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(f)] ?? 'application/octet-stream',
      'cache-control': 'max-age=600',
    });
    createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://localhost:${(srv.address() as AddressInfo).port}/`;
  try {
    await page.goto(url);
    await page.waitForFunction('!!navigator.serviceWorker.controller');
    root = b;
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then((r) => r?.update() as Promise<unknown>),
    );
    const toast = page.getByRole('status').filter({ hasText: 'Update available' });
    await toast.waitFor();
    await Promise.all([
      page.waitForEvent('load'),
      toast.getByRole('button', { name: 'Reload' }).click(),
    ]);

    const info = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((k) => k.startsWith('baccaratton-'));
      const c = await caches.open(names[0]!);
      const html = await (await c.match('./index.html'))!.text();
      const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
      const cached = await Promise.all(srcs.map(async (s) => !!(await c.match(s))));
      return { names, srcs, cached };
    });
    expect(info.names).toHaveLength(1);
    expect(info.srcs.length).toBeGreaterThan(0);
    expect(info.srcs.join()).toContain('index-v2-');
    expect(info.cached.every(Boolean)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  } finally {
    srv.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
