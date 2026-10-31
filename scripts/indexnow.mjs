// Pings IndexNow (Bing, Yandex, Seznam, …) with every URL in a built sitemap.xml.
// Usage: node scripts/indexnow.mjs dist/sitemap.xml
// Dependency-free; run by .github/workflows/pages.yml after a successful deploy to main.
import { readFileSync } from 'node:fs';

const KEY = 'a02c23620b24433ba3470d53547479ec';
const file = process.argv[2] ?? 'dist/sitemap.xml';
const urlList = [...readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) {
  console.error(`indexnow: no <loc> URLs in ${file}`);
  process.exit(1);
}
const body = {
  host: 'creynia.com',
  key: KEY,
  keyLocation: `https://creynia.com/${KEY}.txt`,
  urlList,
};
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
console.log(`indexnow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
// 200 OK and 202 Accepted are both success.
if (!res.ok) process.exit(1);
