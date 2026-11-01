// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against a real `npm run build` (CI runs build:all before tests).
describe.skipIf(!existsSync('dist/sw.js'))('dist/sw.js', () => {
  const sw = existsSync('dist/sw.js') ? readFileSync('dist/sw.js', 'utf8') : '';
  const list = (): string[] => {
    const m = /const urls = (\[.*?\])\.map|__PRECACHE__|(\[\s*"\.\/".*?\])/s.exec(sw);
    const json = m?.[1] ?? m?.[2];
    return json ? (JSON.parse(json) as string[]) : [];
  };

  it('has the build constants substituted', () => {
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw).not.toContain('__VERSION__');
    expect(sw).toMatch(/baccaratton-/);
  });
  it('precaches the shell, the manifest, the icons and every built asset', () => {
    const urls = list();
    expect(urls).toContain('./');
    expect(urls).toContain('./index.html');
    expect(urls).toContain('./manifest.webmanifest');
    expect(urls).toContain('./icons/icon-192.png');
    const assets = readdirSync('dist/assets');
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) expect(urls).toContain(`./assets/${a}`);
  });
  it('precaches with cache: reload (bypasses the HTTP cache, Pages max-age=600)', () => {
    expect(sw).toMatch(/new Request\(\w+, \{ cache: ["']reload["'] \}\)/);
  });
  it('deletes only its own old caches on activate', () => {
    expect(sw).toMatch(/startsWith\(PREFIX\) && \w+ !== CACHE/);
  });
  it('never precaches the static SEO pages, sitemap or llms files', () => {
    const urls = list();
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls)
      expect(u).not.toMatch(
        /^\.\/(learn|bets|glossary|systems|odds|third-card-rule)\/|sitemap\.xml|llms(-full)?\.txt/,
      );
  });
  it('leaves static page requests to the network (no app-shell fallback)', () => {
    expect(sw).not.toContain('__BYPASS__');
    expect(sw).toContain(
      '["learn","bets","glossary","systems","odds","third-card-rule","sitemap.xml","llms.txt","llms-full.txt"]',
    );
    expect(sw).toMatch(/if \(bypassed\(url\)\)\s*return;/);
  });
  it('never skips waiting on its own and does not cache the offline copy', () => {
    expect(sw).toContain('SKIP_WAITING');
    expect(list()).not.toContain('./baccaratton.html');
  });
});
