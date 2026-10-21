// Renames dist-single/index.html -> dist-single/baccaratton.html and fails the build if the
// result references anything external (src=/href= other than data:, #fragment, or an
// absolute https:// link, which is only allowed as a plain anchor in lesson prose).
import { existsSync, readFileSync, renameSync, statSync } from 'node:fs';

// Size budget (architecture.md 5.4): target <= 450 kB, hard fail at 600 kB.
const TARGET_SINGLE_BYTES = 450_000;
const MAX_SINGLE_BYTES = 600_000;

const dir = 'dist-single';
if (existsSync(`${dir}/index.html`)) renameSync(`${dir}/index.html`, `${dir}/baccaratton.html`);
if (!existsSync(`${dir}/baccaratton.html`)) {
  console.error('finalize-single: dist-single/baccaratton.html missing');
  process.exit(1);
}

const html = readFileSync(`${dir}/baccaratton.html`, 'utf8');
const bad = [];
// Literal attributes in the HTML shell only (inline script/style bodies are skipped).
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((m) => m[1])
  .join('\n');
const shell = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.slice(0, m.indexOf('>') + 1))
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
// Inline CSS: no @import and no url() other than data: or a #fragment (fonts, images).
if (/@import\b/i.test(styles)) bad.push('CSS @import');
for (const m of styles.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
  const val = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  if (!val.startsWith('data:') && !val.startsWith('#')) bad.push(`CSS url(${val.slice(0, 80)})`);
}
if (/<base\b/i.test(shell)) bad.push('<base> element');
if (/\ssrcset\s*=/i.test(shell)) bad.push('srcset attribute');
for (const m of shell.matchAll(
  /<([a-z0-9]+)\b[^>]*?\s(src|href|poster|data|action)\s*=\s*("([^"]*)"|'([^']*)')/gi,
)) {
  const tag = m[1].toLowerCase();
  const val = (m[4] ?? m[5] ?? '').trim();
  if (val.startsWith('data:') || val.startsWith('#')) continue;
  if (tag === 'a' && /^https:\/\//.test(val)) continue;
  bad.push(`<${tag} ${m[2]}="${val.slice(0, 80)}">`);
}
if (/\brel\s*=\s*["']?(manifest|apple-touch-icon|stylesheet|modulepreload)/i.test(shell)) {
  bad.push('manifest/apple-touch-icon/stylesheet/modulepreload link');
}
if (/\bnavigator\.serviceWorker\.register\b/.test(html)) bad.push('service worker registration');

const size = statSync(`${dir}/baccaratton.html`).size;
if (size > MAX_SINGLE_BYTES) bad.push(`size ${size} B exceeds the ${MAX_SINGLE_BYTES} B budget`);

if (bad.length) {
  console.error('finalize-single: external references found:\n  ' + bad.join('\n  '));
  process.exit(1);
}
if (size > TARGET_SINGLE_BYTES) {
  console.warn(`finalize-single: WARNING ${size} B is over the ${TARGET_SINGLE_BYTES} B target`);
}
console.log(`finalize-single: dist-single/baccaratton.html (no external references, ${size} B)`);
