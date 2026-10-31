// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_URL, buildStaticSite, isStaticOutput, siteUrls } from '../../build/static-site';
import { buildContent } from '../../src/content/load';

const site = buildStaticSite(process.cwd());
const content = buildContent(process.cwd());
const one = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

describe('static SEO pages (generator)', () => {
  it('has a page for every shipped lesson, bet, and the index pages', () => {
    const paths = new Set(site.pages.map((p) => p.path));
    for (const l of content.lessons) expect(paths).toContain(`learn/${l.id}/`);
    for (const id of Object.keys(content.bets)) expect(paths).toContain(`bets/${id}/`);
    for (const p of ['learn/', 'bets/', 'glossary/', 'systems/']) expect(paths).toContain(p);
    expect([...paths].some((p) => p.includes('sample'))).toBe(false);
  });

  it.each(site.pages.map((p) => [p.path, p] as const))(
    '%s: one h1, title, description, canonical, JSON-LD, no raw lesson syntax',
    (path, p) => {
      const html = p.html;
      expect(one(html, /<h1[\s>]/g)).toBe(1);
      expect(one(html, /<title>[^<]+<\/title>/g)).toBe(1);
      expect(one(html, /<meta name="description" content="[^"]{50,}">/g)).toBe(1);
      expect(p.description.length).toBeLessThanOrEqual(160);
      expect(html).toContain(`<link rel="canonical" href="${APP_URL}${path}">`);
      expect(html).toContain('"@id":"https://creynia.com/#creynia"');
      expect(html).toContain('"BreadcrumbList"');
      expect(html).toContain('og:image" content="https://creynia.com/assets/og/baccaratton.jpg"');
      expect(html).toContain('1-800-GAMBLER');
      expect(html).not.toContain('creynia.github.io');
      expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
      // Unrendered lesson syntax or app-only links must never ship.
      const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
      expect(main).not.toMatch(/\{\{|\[\[|^:::|```|href="#\/glossary/m);
      // JSON-LD parses.
      const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1] ?? '';
      expect(() => JSON.parse(ld) as unknown).not.toThrow();
    },
  );

  it('lesson pages carry a relative CTA into the app hash route', () => {
    const p = site.pages.find((x) => x.path === 'learn/welcome/')!;
    expect(p.html).toContain('href="../../#/learn/welcome"');
    expect(p.html).toContain('"LearningResource"');
    expect(p.html).toMatch(/"timeRequired":"PT\d+M"/);
  });

  it('glossary has one anchor per term', () => {
    const p = site.pages.find((x) => x.path === 'glossary/')!;
    for (const g of content.glossary) expect(p.html).toContain(`<dt id="${g.slug}">`);
    expect(p.html).toContain('"DefinedTermSet"');
  });

  it('sitemap lists exactly the SPA root and every emitted page', () => {
    const xml = site.files.get('sitemap.xml')!;
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(siteUrls(site.pages).sort());
    expect(xml).not.toContain('<lastmod>');
  });

  it('llms.txt links every page; llms-full.txt has every page', () => {
    const llms = site.files.get('llms.txt')!;
    expect(llms.startsWith('# baccaratton — Baccarat')).toBe(true);
    const full = site.files.get('llms-full.txt')!;
    for (const p of site.pages) {
      expect(llms).toContain(`(${APP_URL}${p.path})`);
      expect(full).toContain(`Source: ${APP_URL}${p.path}`);
    }
    expect(full).not.toMatch(/\{\{|\[\[|^:::|```/m);
  });

  it('isStaticOutput covers the generated files only', () => {
    for (const f of site.files.keys()) expect(isStaticOutput(f)).toBe(true);
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'assets/index-x.js'])
      expect(isStaticOutput(f)).toBe(false);
  });

  it('the SPA description quotes the real lesson count', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`${content.lessons.length} short lessons`);
  });
});

// Runs against a real `npm run build` (CI runs build:all before tests).
describe.skipIf(!existsSync('dist/sitemap.xml'))('dist static pages', () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  it('every sitemap URL is an emitted file, and every emitted page is in the sitemap', () => {
    const xml = readFileSync('dist/sitemap.xml', 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    const pages = walk('dist')
      .filter((f) => f.endsWith('index.html'))
      .map((f) => APP_URL + f.slice('dist/'.length).replace(/index\.html$/, ''));
    expect(locs.sort()).toEqual(pages.sort());
  });
  it('the SPA shell has a canonical, JSON-LD and a noscript with links to the static pages', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).toContain(`<link rel="canonical" href="${APP_URL}"`);
    expect(html).toContain('"WebApplication"');
    expect(html).toMatch(/<noscript>[\s\S]*href="\.\/learn\/"[\s\S]*<\/noscript>/);
  });
  it('the single-file build carries no canonical or static links', () => {
    if (!existsSync('dist-single/baccaratton.html')) return;
    const html = readFileSync('dist-single/baccaratton.html', 'utf8');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('<noscript>');
  });
});
