// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/finalize-single.mjs');

function finalize(html: string): { ok: boolean; out: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'baccaratton-fs-'));
  try {
    mkdirSync(join(cwd, 'dist-single'));
    writeFileSync(join(cwd, 'dist-single/index.html'), html);
    try {
      const out = execFileSync('node', [script], { cwd, stdio: 'pipe' }).toString();
      return { ok: existsSync(join(cwd, 'dist-single/baccaratton.html')), out };
    } catch (e) {
      return { ok: false, out: String((e as { stderr?: Buffer }).stderr) };
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('finalize-single', () => {
  it('accepts a self-contained page', () => {
    const r = finalize(
      '<html><head><link rel="icon" href="data:image/svg+xml,x"><script type="module">const a="https://x.y/z.js"</script></head><body><a href="#top">t</a><a href="https://example.com/">e</a><style>i{background:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E")} b{mask:url(#m)}</style><div data-x="./a"></div><svg><use xlink:href="#chip"></use><image xlink:href="data:image/png;base64,AA"></image></svg><script>const css = "<style>@import \'x.css\';</style>";</script></body></html>',
    );
    expect(r.ok).toBe(true);
  });
  it.each([
    '<script type="module" src="./assets/a.js"></script>',
    '<link rel="stylesheet" href="./a.css">',
    '<link rel="manifest" href="./manifest.webmanifest">',
    '<img src="https://example.com/a.png">',
    '<script>navigator.serviceWorker.register("./sw.js")</script>',
    '<style>@import "https://fonts.example/a.css";</style>',
    '<style>body{background:url("./felt.png")}</style>',
    '<style>@font-face{src:url(https://fonts.example/a.woff2)}</style>',
    '<base href="https://example.com/">',
    '<img srcset="./a.png 2x" src="data:image/png;base64,AA">',
    '<video poster="./p.jpg"></video>',
    '<object data="./a.svg"></object>',
    '<a href="./other.html">x</a>',
    '<svg><use xlink:href="./sprite.svg#chip"></use></svg>',
  ])('rejects %s', (frag) => {
    expect(finalize(`<html><head>${frag}</head><body></body></html>`).ok).toBe(false);
  });
  it('fails above the 600 kB budget and passes below it', () => {
    const body = (n: number) => `<html><body><script>/*${'x'.repeat(n)}*/</script></body></html>`;
    expect(finalize(body(599_000)).ok).toBe(true);
    expect(finalize(body(601_000)).ok).toBe(false);
  });
});

// Runs against a real build when one exists (CI runs build:all before tests).
describe.skipIf(!existsSync('dist-single/baccaratton.html'))('dist-single/baccaratton.html', () => {
  const html = existsSync('dist-single/baccaratton.html')
    ? readFileSync('dist-single/baccaratton.html', 'utf8')
    : '';
  it('has no external script/link/manifest references', () => {
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']?(manifest|apple-touch-icon|stylesheet)/i);
  });
  it('does not register a service worker', () => {
    expect(html).not.toContain('serviceWorker.register');
  });
  it('is within the size budget', () => {
    const size = statSync('dist-single/baccaratton.html').size;
    console.log(`baccaratton.html: ${size} B (target 450000, max 600000)`);
    expect(size).toBeLessThanOrEqual(600_000);
  });
});
