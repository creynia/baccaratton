// Static, JS-free HTML pages for search engines and LLMs (docs/seo.md): /learn/, one page per
// lesson, /bets/ (+ one per bet), /glossary/, /systems/, plus sitemap.xml, llms.txt and
// llms-full.txt. The text comes from the same compiled content bundle the app renders
// (src/content/load.ts) and every number from the engine and math, so nothing is typed twice.
// Pure: `buildStaticSite(root)` returns the files; build/vite-plugin-static.ts writes them.
import { parse as parseYaml } from 'yaml';
import { cardFace, parseGroup, splitInline } from '../src/content/cards';
import { parseQuizzes, parseTableau, segment, splitFrontMatter } from '../src/content/compile';
import { buildContent, readSources } from '../src/content/load';
import type { Block, ContentBundle, Lesson, Quiz, TableauBlockData } from '../src/content/types';
import { TIER_LABEL } from '../src/content/types';
import {
  BET_IDS,
  BET_IDS_BY_VARIANT,
  TABLEAU,
  VARIANT_IDS,
  VARIANT_RULES,
  bankerDraws,
  betDef,
  cardCode,
  playerDraws,
} from '../src/sim/engine';
import type { BetId, Card, CardValue, TableRules, TiePays, VariantId } from '../src/sim/engine';
import { fraction, fullShoeEvs } from '../src/sim/math';
import type { BetEv, Fraction } from '../src/sim/math';

// ---------- site facts (shared brief: URL contract) ----------
export const ORIGIN = 'https://creynia.com';
export const APP = 'baccaratton';
export const GAME = 'Baccarat';
export const GAME_LONG = 'Baccarat (Punto Banco)';
export const THEME = '#5c1a2b';
export const APP_URL = `${ORIGIN}/${APP}/`;
export const OG_IMAGE = `${ORIGIN}/assets/og/${APP}.jpg`;
const PERSON_ID = `${ORIGIN}/#creynia`;
const WEBSITE_ID = `${ORIGIN}/#website`;
const COURSE_ID = `${APP_URL}learn/#course`;
const OTHER_APPS = [
  { app: 'crappy', game: 'Craps' },
  { app: 'holdumb', game: "Ultimate Texas Hold'em" },
  { app: 'spinner', game: 'Roulette strategy lab' },
];

/** Output paths (relative to dist) owned by this generator: the SW never precaches these. */
export const STATIC_DIRS = ['learn', 'bets', 'glossary', 'systems'] as const;
export const STATIC_FILES = ['sitemap.xml', 'llms.txt', 'llms-full.txt'] as const;
export function isStaticOutput(rel: string): boolean {
  return (
    (STATIC_FILES as readonly string[]).includes(rel) ||
    STATIC_DIRS.some((d) => rel === d || rel.startsWith(d + '/'))
  );
}

export interface StaticPage {
  /** 'learn/welcome/' (trailing slash, no leading slash) */
  path: string;
  title: string;
  description: string;
  html: string;
  /** Readable markdown of the page, for llms-full.txt */
  markdown: string;
}

export interface StaticSite {
  pages: StaticPage[];
  /** Every file to write, keyed by dist-relative path ('learn/welcome/index.html', 'sitemap.xml') */
  files: Map<string, string>;
}

// ---------- small helpers ----------
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (path: string) => APP_URL + path;
const depthOf = (path: string) => path.split('/').filter(Boolean).length;
const relRoot = (path: string) => '../'.repeat(depthOf(path));

/** Clamp a description to `max` chars at a word boundary. */
export function clampText(s: string, max = 160): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '') + '…';
}

/** "1.058%" from an exact fraction (the app's pct, digits decimals). */
function pct(f: Fraction, digits = 3): string {
  return fraction.toFixed(fraction.mul(f, fraction.frac(100n)), digits).replace(/^-/, '−') + '%';
}

const VARIANT_NAME: Record<VariantId, string> = {
  'punto-banco': 'Punto Banco (5% commission)',
  ez: 'EZ Baccarat (no commission)',
  'super-6': 'Super 6 (Banker 6 pays half)',
};
const tableRules = (v: VariantId, tiePays: TiePays): TableRules => ({
  ...VARIANT_RULES[v],
  tiePays,
});

/** Plain text of `{{cards}}`: "K♥ 7♦" (+ " = 7" with a badge). */
function cardsText(codes: string): string {
  const g = parseGroup(codes);
  const faces = g.cards.map((c) => {
    const f = cardFace(c);
    return f.rank + f.glyph.replace('\uFE0E', '');
  });
  return faces.join(' ') + (g.badge ? ` = ${g.total}` : '');
}

/** Inline text with `{{cards}}` (quiz text): HTML, the same card markup the app draws. */
function inlineHtml(text: string): string {
  return splitInline(text)
    .map((s) => {
      if (s.t === 'text') return esc(s.text);
      const faces = s.cards.map(cardFace);
      const label = `${faces.map((f) => f.name).join(', ')} (total ${s.total})`;
      const inner = faces
        .map((f) => `<span class="pc suit-${f.suit}" aria-hidden="true">${f.rank}${f.glyph}</span>`)
        .join('');
      const tag = s.badge ? `<span class="pc-total" aria-hidden="true">${s.total}</span>` : '';
      return `<span class="cards" role="img" aria-label="${esc(label)}">${inner}${tag}</span>`;
    })
    .join('');
}
const inlineText = (text: string) =>
  splitInline(text)
    .map((s) => (s.t === 'text' ? s.text : cardsText(s.codes)))
    .join('');

/** Markdown source → readable markdown: `[[term|label]]` → label, `{{cards}}` → text. */
function plainMd(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, l?: string) => l ?? t.trim())
    .replace(/\{\{([^{}]*)\}\}/g, (_m, c: string) => cardsText(c));
}

/** Rewrite the app's in-app links in compiled HTML for a static page at `path`. */
function staticLinks(html: string, path: string): string {
  const r = relRoot(path);
  return html.replace(/href="#\/glossary\?term=([^"]+)"/g, (_m, slug: string) =>
    path === 'glossary/' ? `href="#${slug}"` : `href="${r}glossary/#${slug}"`,
  );
}

// ---------- drawing rules (from the engine's TABLEAU, like src/app/tableauText.ts) ----------
function valueList(values: readonly number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j]! + 1) j++;
    if (j - i >= 2) out.push(`${values[i]}–${values[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(values[k]));
    i = j + 1;
  }
  return out.join(', ');
}
const ten = [...Array(10).keys()] as CardValue[];

function playerRuleText(): string[] {
  const draws = ten.filter((t) => t < 8 && playerDraws(t, 0).draws);
  const stands = ten.filter((t) => t < 8 && !playerDraws(t, 0).draws);
  return [
    `Player ${valueList(draws)}: the Player draws a third card.`,
    `Player ${valueList(stands)}: the Player stands.`,
    'Player or Banker 8 or 9 on two cards is a natural: both hands stand.',
  ];
}
function bankerRowText(b: number): string {
  const row = TABLEAU[b];
  if (!row) return '';
  const draws = ten.filter((p) => row[1 + p]);
  if (draws.length === 10) return `Banker ${b} always draws.`;
  if (draws.length === 0) return `Banker ${b} always stands.`;
  const stands = ten.filter((p) => !row[1 + p]);
  if (stands.length <= 2)
    return `Banker ${b} draws on anything except a Player third card of ${valueList(stands)}.`;
  return `Banker ${b} draws when the Player's third card is ${valueList(draws)}.`;
}
function describeCell(cell: string): string | null {
  if (cell === 'nat') return 'A natural (8 or 9 on two cards, either side): both hands stand.';
  const p = /^p([0-9])$/.exec(cell);
  if (p) {
    const t = Number(p[1]) as CardValue;
    if (t >= 8) return `Player ${t} is a natural: both hands stand.`;
    return `Player ${t}: the Player ${playerDraws(t, 0).draws ? 'draws' : 'stands'}.`;
  }
  const b = /^b([0-9])\/(s|p([0-9]))$/.exec(cell);
  if (!b || TABLEAU[Number(b[1])] === undefined) return null;
  const bt = Number(b[1]) as CardValue;
  if (b[2] === 's')
    return `Banker ${bt}, the Player stood: the Banker ${bankerDraws(bt, 6, null).draws ? 'draws' : 'stands'}.`;
  const third = Number(b[3]) as CardValue;
  return `Banker ${bt}, Player's third card ${third}: the Banker ${bankerDraws(bt, 0, third).draws ? 'draws' : 'stands'}.`;
}

function tableauLines(t: TableauBlockData): string[] {
  const lines: string[] = [];
  if (t.view !== 'banker') lines.push(...playerRuleText());
  if (t.view !== 'player') {
    lines.push(
      `When the Player stood: Banker ${valueList(ten.filter((b) => b < 8 && bankerDraws(b, 6, null).draws))} draws, Banker ${valueList(ten.filter((b) => b < 8 && !bankerDraws(b, 6, null).draws))} stands.`,
    );
    for (let b = 0; b < 8; b++) lines.push(bankerRowText(b));
  }
  return lines;
}

function tableauHtml(t: TableauBlockData): string {
  const hl = new Set(t.highlight ?? []);
  let table = '';
  if (t.view !== 'player') {
    const head = ten.map((p) => `<th scope="col">${p}</th>`).join('');
    const rows = [0, 1, 2, 3, 4, 5, 6, 7]
      .map((b) => {
        const stood = bankerDraws(b as CardValue, 6, null).draws;
        const cells = ten
          .map((p) => {
            const d = bankerDraws(b as CardValue, 0, p).draws;
            const mark = hl.has(`b${b}/p${p}`) ? ' class="hl"' : '';
            return `<td${mark}>${d ? 'Draw' : 'Stand'}</td>`;
          })
          .join('');
        const sm = hl.has(`b${b}/s`) ? ' class="hl"' : '';
        return `<tr><th scope="row">Banker ${b}</th><td${sm}>${stood ? 'Draw' : 'Stand'}</td>${cells}</tr>`;
      })
      .join('');
    table = `<figcaption>What the Banker does, by the Banker's two-card total (rows) and the Player's third card (columns):</figcaption><div class="scroll"><table class="tableau"><thead><tr><th scope="col">Banker total</th><th scope="col">Player stood</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const lines = tableauLines(t)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('');
  const notes = [...hl]
    .map(describeCell)
    .filter((x): x is string => !!x)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('');
  return `<figure class="rules-box">${table}<ul>${lines}</ul>${notes ? `<p><strong>Look at:</strong></p><ul>${notes}</ul>` : ''}</figure>`;
}

// ---------- lesson blocks ----------
const LETTERS = 'ABCDEFGH';

function quizHandText(q: Quiz): string | null {
  if (!q.hand) return null;
  const side = (cs: readonly Card[]) => cs.map(cardCode).join(' ');
  return `Player ${cardsText(side(q.hand.player) + ' =')}, Banker ${cardsText(side(q.hand.banker) + ' =')}`;
}

function quizHtml(q: Quiz): string {
  const hand = q.hand
    ? `<p class="hand"><span>Player ${inlineHtml(`{{${q.hand.player.map((c) => cardCode(c)).join(' ')} =}}`)}</span> <span>Banker ${inlineHtml(`{{${q.hand.banker.map((c) => cardCode(c)).join(' ')} =}}`)}</span></p>`
    : '';
  const opts = q.choices.map((c) => `<li>${inlineHtml(c)}</li>`).join('');
  return `<section class="quiz" aria-label="Quiz question"><p class="tag">Quiz</p>${hand}<p class="q">${inlineHtml(q.prompt)}</p><ol type="A">${opts}</ol><details><summary>Show the answer</summary><p><strong>${LETTERS[q.answer]}: ${inlineHtml(q.choices[q.answer] ?? '')}.</strong> ${inlineHtml(q.explanation)}</p></details></section>`;
}

function blockHtml(b: Block, lessonId: string, path: string): string {
  const spa = `${relRoot(path)}#/learn/${lessonId}`;
  switch (b.kind) {
    case 'html':
      return staticLinks(b.html, path);
    case 'tip':
      return `<aside class="tip"><strong>Tip</strong>${staticLinks(b.html, path)}</aside>`;
    case 'math':
      return `<details class="math"><summary>Show the math: ${esc(b.title)}</summary>${staticLinks(b.html, path)}</details>`;
    case 'scene':
      return `<aside class="try"><strong>Try it at the table${b.scene.title ? `: ${esc(b.scene.title)}` : ''}.</strong> This step is an interactive hand on the practice table. <a href="${spa}">Play it in ${APP}</a> (free, play money).</aside>`;
    case 'tableau':
      return tableauHtml(b.tableau);
    case 'roads':
      return `<aside class="try"><strong>Scoreboard${b.roads.caption ? `: ${inlineHtml(b.roads.caption)}` : ''}.</strong> The app draws this Bead Plate and Big Road. <a href="${spa}">Open the lesson in ${APP}</a>.</aside>`;
    case 'quiz':
      return quizHtml(b.quiz);
  }
}

/** The lesson as readable markdown, from the same segments the compiler reads. */
function lessonMarkdown(source: string, lesson: Lesson): string {
  const { body } = splitFrontMatter(source);
  const out: string[] = [];
  let quizCount = 0;
  for (const seg of segment(body)) {
    if (seg.t === 'md') out.push(plainMd(seg.text).trim());
    else if (seg.t === 'box')
      out.push(
        seg.kind === 'tip'
          ? `> **Tip:** ${plainMd(seg.text).trim().replace(/\n/g, '\n> ')}`
          : `**Show the math: ${seg.title}**\n\n${plainMd(seg.text).trim()}`,
      );
    else if (seg.lang === 'scene') {
      const raw = parseYaml(seg.text) as { title?: string } | null;
      out.push(
        `*(Interactive practice hand in the app${raw?.title ? `: ${raw.title}` : ''}: ${APP_URL}#/learn/${lesson.id})*`,
      );
    } else if (seg.lang === 'tableau')
      out.push(
        tableauLines(parseTableau(seg.text))
          .map((l) => `- ${l}`)
          .join('\n'),
      );
    else if (seg.lang === 'roads') out.push(`*(Scoreboard drawing in the app)*`);
    else {
      const qs = parseQuizzes(seg.text, lesson.id, quizCount);
      quizCount += qs.length;
      for (const q of qs) {
        const hand = quizHandText(q);
        out.push(
          [
            `**Quiz:** ${hand ? `${hand}. ` : ''}${inlineText(q.prompt)}`,
            '',
            ...q.choices.map((c, i) => `${LETTERS[i]}. ${inlineText(c)}`),
            '',
            `Answer: ${LETTERS[q.answer]}. ${inlineText(q.explanation)}`,
          ].join('\n'),
        );
      }
    }
  }
  return out.filter(Boolean).join('\n\n');
}

// ---------- page shell ----------
interface Crumb {
  name: string;
  path: string | null; // null: the app root; '' never used
}

const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%235c1a2b'/%3E%3Ccircle cx='32' cy='32' r='29' fill='none' stroke='%23d4af37' stroke-width='1.5'/%3E%3Crect x='14' y='12' width='26' height='38' rx='4' fill='%23f8f5ec'/%3E%3Crect x='24' y='15' width='26' height='38' rx='4' fill='%23f8f5ec' stroke='%235c1a2b' stroke-width='2'/%3E%3Ccircle cx='37' cy='29' r='5' fill='none' stroke='%235c1a2b' stroke-width='3'/%3E%3Cpath d='M42 30l-1 6-3 5-6 2' fill='none' stroke='%235c1a2b' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M37 44l3 4-3 4-3-4z' fill='%23c0262d'/%3E%3C/svg%3E`;

const CSS = `
:root{color-scheme:dark;--felt:${THEME};--bg:#2a0b14;--panel:#3d1220;--ink:#f8f1e4;--muted:#d9c6b4;--gold:#e2bf55;--line:#6e3446}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg) radial-gradient(ellipse at top,var(--felt),var(--bg) 70%) no-repeat;color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--gold)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.wrap{max-width:70ch;margin:0 auto;padding:0 16px}
header.site{border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;gap:12px;align-items:baseline;justify-content:space-between;padding-top:12px;padding-bottom:12px}
header.site a{text-decoration:none}
.brand{font-size:.85rem;color:var(--muted)}
.app{font-weight:700;font-size:1.1rem;color:var(--ink)}
nav.crumbs{font-size:.85rem;color:var(--muted);margin:16px 0 0}
nav.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
nav.crumbs li+li::before{content:"›";margin-right:4px}
nav.crumbs a{color:var(--muted)}
h1{font-size:clamp(1.6rem,6vw,2.2rem);line-height:1.2;margin:.6em 0 .3em}
h2{font-size:1.3rem;margin:1.6em 0 .4em}
h3{font-size:1.1rem;margin:1.3em 0 .3em}
.meta,.muted{color:var(--muted)}
.lead{font-size:1.1rem}
.cta{display:inline-block;margin:12px 0;padding:12px 20px;border-radius:999px;background:var(--gold);color:#2a0b14;font-weight:700;text-decoration:none}
.cta:hover{filter:brightness(1.08)}
.scroll,table{max-width:100%}
.scroll{overflow-x:auto}
table{border-collapse:collapse;margin:1em 0;display:block;overflow-x:auto}
.scroll table{display:table}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--panel)}
td.hl{outline:2px solid var(--gold);outline-offset:-2px}
blockquote{margin:1em 0;padding:4px 16px;border-left:4px solid var(--gold);background:var(--panel)}
aside,.quiz,details.math,figure.rules-box{display:block;margin:1.2em 0;padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
figure.rules-box{margin-left:0;margin-right:0}
aside.tip>strong:first-child,.tag{display:block;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);margin:0}
aside.try{border-style:dashed}
details summary{cursor:pointer;font-weight:600}
.quiz ol{padding-left:1.6em}
.q{font-weight:600}
.cards{display:inline-flex;gap:2px;vertical-align:middle;white-space:nowrap}
.pc{display:inline-block;min-width:1.9em;padding:0 .25em;border-radius:4px;background:#fbf8f1;color:#1a1a1a;font-weight:700;font-size:.9em;line-height:1.5;text-align:center}
.pc.suit-h,.pc.suit-d{color:#b3121f}
.pc-total{display:inline-block;margin-left:4px;padding:0 .4em;border-radius:999px;background:var(--gold);color:#2a0b14;font-weight:700;font-size:.85em}
.hand{display:flex;flex-wrap:wrap;gap:12px}
ul.toc{padding-left:1.2em}
ul.toc li{margin:.4em 0}
dl.gloss dt{font-weight:700;margin-top:1.2em}
dl.gloss dd{margin:0}
dl.gloss dd p{margin:.3em 0}
.pager{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin:24px 0;padding-top:16px;border-top:1px solid var(--line)}
footer.site{margin-top:48px;border-top:1px solid var(--line);color:var(--muted);padding:16px 0 32px}
footer.site p{margin:.5em 0;font-size:.9rem}
code{background:var(--panel);padding:0 4px;border-radius:4px}
img{max-width:100%}
`
  .replace(/\n/g, '')
  .trim();

function breadcrumbLd(crumbs: Crumb[]) {
  const items = [
    { name: 'Know the Odds', item: `${ORIGIN}/` },
    { name: APP, item: APP_URL },
    ...crumbs.map((c) => ({ name: c.name, item: abs(c.path ?? '') })),
  ];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

const PERSON = { '@type': 'Person', '@id': PERSON_ID, name: 'creynia', url: `${ORIGIN}/` };

function ldScript(graph: unknown[]): string {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  return `<script type="application/ld+json">${json.replace(/</g, '\\u003c')}</script>`;
}

function footerHtml(): string {
  const others = OTHER_APPS.map(
    (o) => `<a href="${ORIGIN}/${o.app}/">${esc(o.app)}</a> (${esc(o.game)})`,
  ).join(' · ');
  return `<footer class="site"><div class="wrap"><p><strong>For education only, with play money only.</strong> The house always has an edge, and no betting system changes that. These apps show how big the edge is, not how to beat it.</p><p>If gambling is hurting you or someone you know, call or text <strong>1-800-GAMBLER</strong> (US), or contact your national problem-gambling helpline.</p><p>More from Know the Odds: ${others} · <a href="${ORIGIN}/">creynia.com</a></p></div></footer>`;
}

function page(opts: {
  path: string;
  title: string;
  description: string;
  crumbs: Crumb[];
  ld: unknown[];
  ogType?: string;
  body: string;
}): string {
  const { path, title, description, crumbs } = opts;
  const url = abs(path);
  const r = relRoot(path);
  const crumbNav = [
    `<li><a href="${ORIGIN}/">Know the Odds</a></li>`,
    `<li><a href="${r}">${APP}</a></li>`,
    ...crumbs.map((c, i) =>
      i === crumbs.length - 1
        ? `<li aria-current="page">${esc(c.name)}</li>`
        : `<li><a href="${r}${c.path ?? ''}">${esc(c.name)}</a></li>`,
    ),
  ].join('');
  const ld = ldScript([...opts.ld, breadcrumbLd(crumbs)]);
  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta name="theme-color" content="${THEME}">`,
    `<link rel="icon" href="${FAVICON}">`,
    `<meta property="og:site_name" content="Know the Odds">`,
    `<meta property="og:type" content="${opts.ogType ?? 'website'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    `<style>${CSS}</style>`,
    ld,
  ].join('\n');
  return `<!doctype html>
<html lang="en">
<head>
${meta}
</head>
<body>
<header class="site"><div class="wrap"><a class="brand" href="${ORIGIN}/">Know the Odds</a><a class="app" href="${r}">${APP}</a></div></header>
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbNav}</ol></nav>
<main>
${opts.body}
</main>
</div>
${footerHtml()}
</body>
</html>
`;
}

// ---------- the site ----------
const lessonTitle = (t: string) => {
  const full = `${t} | Learn ${GAME} | ${APP}`;
  return full.length <= 65 ? full : `${t} | ${APP}`;
};

/** Pad a too-short description with honest context, then clamp to 160. */
function describe(base: string, extras: string[]): string {
  let d = base.trim();
  for (const e of extras) if (e && d.length < 140 && d.length + 1 + e.length <= 160) d += ' ' + e;
  return clampText(d);
}

export function buildStaticSite(root: string): StaticSite {
  const content: ContentBundle = buildContent(root);
  const src = readSources(root);
  const sourceById = new Map(
    src.lessonFiles.map((f) => [f.slug, f.source] as const).filter(([s]) => !s.startsWith('_')),
  );
  const pages: StaticPage[] = [];
  const lessons = content.lessons.filter((l) => !l.id.startsWith('sample-'));
  const chapterOf = new Map(content.chapters.map((c) => [c.id, c] as const));
  const lessonById = new Map(lessons.map((l) => [l.id, l] as const));
  const total = lessons.length;

  // /learn/
  {
    const path = 'learn/';
    const description = clampText(
      `A free ${GAME_LONG} course in ${total} short lessons: counting a hand, the third-card rule, the house edge of every bet, betting systems and side bets.`,
    );
    let n = 0;
    const chapters = content.chapters
      .map((ch) => {
        const items = ch.lessons
          .map((id) => lessonById.get(id))
          .filter((l): l is Lesson => !!l)
          .map((l) => {
            n++;
            return `<li><a href="${l.id}/">${n}. ${esc(l.title)}</a> <span class="muted">(${l.minutes} min)</span><br>${esc(l.summary)}</li>`;
          })
          .join('');
        return `<section><h2>${esc(ch.title)}</h2><p class="muted">${esc(ch.summary)}</p><ul class="toc">${items}</ul></section>`;
      })
      .join('\n');
    const body = `<h1>Learn ${GAME}: the free course</h1>
<p class="lead">${total} short lessons that take ${GAME_LONG} from zero to perfect strategy: how a hand is counted, when each side draws, what every bet really costs, and why no betting system or scoreboard pattern changes the house edge.</p>
<p><a class="cta" href="../#/learn">Start the course in ${APP} — free, play money</a></p>
${chapters}
<p>Reference: <a href="../bets/">bets and house edges</a> · <a href="../systems/">betting systems</a> · <a href="../glossary/">glossary</a></p>`;
    const markdown = [
      `# Learn ${GAME}: the free course`,
      '',
      ...content.chapters.flatMap((ch) => [
        `## ${ch.title}`,
        '',
        ch.summary,
        '',
        ...ch.lessons
          .map((id) => lessonById.get(id))
          .filter((l): l is Lesson => !!l)
          .map((l) => `- [${l.title}](${abs(`learn/${l.id}/`)}): ${l.summary}`),
        '',
      ]),
    ].join('\n');
    const ld = [
      {
        '@type': 'Course',
        '@id': COURSE_ID,
        name: `Learn ${GAME} (${APP})`,
        description,
        url: abs(path),
        inLanguage: 'en',
        isAccessibleForFree: true,
        provider: PERSON,
        hasCourseInstance: {
          '@type': 'CourseInstance',
          courseMode: 'online',
          courseWorkload: `PT${lessons.reduce((s, l) => s + l.minutes, 0)}M`,
        },
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD', category: 'Free' },
      },
      {
        '@type': 'ItemList',
        itemListElement: lessons.map((l, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: l.title,
          url: abs(`learn/${l.id}/`),
        })),
      },
    ];
    pages.push({
      path,
      title: `Learn ${GAME}: Free Course in ${total} Lessons | ${APP}`,
      description,
      markdown,
      html: page({
        path,
        title: `Learn ${GAME}: Free Course in ${total} Lessons | ${APP}`,
        description,
        crumbs: [{ name: 'Learn', path }],
        ld,
        body,
      }),
    });
  }

  // /learn/<id>/
  lessons.forEach((l, i) => {
    const path = `learn/${l.id}/`;
    const ch = chapterOf.get(l.chapterId);
    const prev = lessons[i - 1];
    const next = lessons[i + 1];
    const quizzes = l.blocks.filter((b) => b.kind === 'quiz').length;
    const scenes = l.blocks.filter((b) => b.kind === 'scene').length;
    const description = describe(l.summary, [
      `Lesson ${i + 1} of ${total} in a free ${GAME_LONG} course.`,
      quizzes ? `With ${quizzes} quiz question${quizzes > 1 ? 's' : ''}.` : '',
      scenes ? 'Practice on a play-money table.' : '',
    ]);
    const title = lessonTitle(l.title);
    const blocks = l.blocks.map((b) => blockHtml(b, l.id, path)).join('\n');
    const cta = `<p><a class="cta" href="../../#/learn/${l.id}">Open this lesson in ${APP} — free, play money</a></p>`;
    const pager = `<nav class="pager" aria-label="Lessons">${prev ? `<a href="../${prev.id}/" rel="prev">← ${esc(prev.title)}</a>` : '<span></span>'}<a href="../">All lessons</a>${next ? `<a href="../${next.id}/" rel="next">${esc(next.title)} →</a>` : '<span></span>'}</nav>`;
    const body = `<article>
<h1>${esc(l.title)}</h1>
<p class="meta">Lesson ${i + 1} of ${total}${ch ? ` · ${esc(ch.title)}` : ''} · ${l.minutes} min</p>
<p class="lead">${esc(l.summary)}</p>
${cta}
${blocks}
${cta}
</article>
${pager}`;
    const md = `# ${l.title}\n\n*Lesson ${i + 1} of ${total}${ch ? ` · ${ch.title}` : ''} · ${l.minutes} min*\n\n${l.summary}\n\n${lessonMarkdown(sourceById.get(l.id) ?? '', l)}`;
    const ld = [
      {
        '@type': ['Article', 'LearningResource'],
        '@id': `${abs(path)}#lesson`,
        headline: l.title,
        name: l.title,
        description,
        url: abs(path),
        inLanguage: 'en',
        timeRequired: `PT${l.minutes}M`,
        educationalLevel:
          i < total / 3 ? 'Beginner' : i < (2 * total) / 3 ? 'Intermediate' : 'Advanced',
        learningResourceType: 'Lesson',
        isAccessibleForFree: true,
        author: PERSON,
        isPartOf: { '@id': COURSE_ID },
        position: i + 1,
        image: OG_IMAGE,
      },
    ];
    pages.push({
      path,
      title,
      description,
      markdown: md,
      html: page({
        path,
        title,
        description,
        crumbs: [
          { name: 'Learn', path: 'learn/' },
          { name: l.title, path },
        ],
        ld,
        ogType: 'article',
        body,
      }),
    });
  });

  // /bets/ and /bets/<id>/
  const evs = new Map<string, BetEv[]>();
  const evsFor = (v: VariantId, t: TiePays) => {
    const k = `${v}:${t}`;
    if (!evs.has(k))
      evs.set(
        k,
        fullShoeEvs(tableRules(v, t)).filter((e) => e.offered),
      );
    return evs.get(k)!;
  };
  const betName = (id: BetId) => content.bets[id]?.name ?? betDef(id).label;
  const offeredIn = (id: BetId) => VARIANT_IDS.filter((v) => BET_IDS_BY_VARIANT[v].includes(id));
  {
    const path = 'bets/';
    const rows = BET_IDS.map((id) => {
      const v = offeredIn(id)[0]!;
      const ev = evsFor(v, 8).find((e) => e.bet === id);
      const copy = content.bets[id];
      return `<li><h2><a href="${id}/">${esc(betName(id))}</a></h2><p>${esc(betDef(id).payoutText(tableRules(v, 8)))}${ev ? `. House edge <strong>${pct(ev.edge)}</strong> (${TIER_LABEL[ev.tier]}) at ${esc(VARIANT_NAME[v])}` : ''}.</p>${copy ? `<p class="muted">${esc(copy.summary)}</p>` : ''}</li>`;
    }).join('');
    const description = clampText(
      `Every ${GAME} bet with its payout and exact house edge for an 8-deck shoe: Banker, Player, Tie, pairs, Dragon Bonus, Dragon 7 and Panda 8.`,
    );
    const body = `<h1>${GAME} bets and house edges</h1>
<p class="lead">What each bet pays and what it costs you on average, per bet placed. Exact for a full 8-deck shoe, Tie paying 8 to 1, ties counted as a push for Player and Banker.</p>
<p><a class="cta" href="../#/bets">Compare the bets in ${APP} — free, play money</a></p>
<ul class="toc">${rows}</ul>
<p>Why the edges are what they are: <a href="../learn/">the free ${GAME} course</a> · <a href="../glossary/">glossary</a></p>`;
    const markdown = [
      `# ${GAME} bets and house edges`,
      '',
      'Exact for a full 8-deck shoe, Tie paying 8 to 1, per bet placed.',
      '',
      ...BET_IDS.map((id) => {
        const v = offeredIn(id)[0]!;
        const ev = evsFor(v, 8).find((e) => e.bet === id);
        return `- [${betName(id)}](${abs(`bets/${id}/`)}): ${betDef(id).payoutText(tableRules(v, 8))}${ev ? `; house edge ${pct(ev.edge)} at ${VARIANT_NAME[v]}` : ''}. ${content.bets[id]?.summary ?? ''}`;
      }),
    ].join('\n');
    const title = `${GAME} Bets, Payouts & House Edge | ${APP}`;
    pages.push({
      path,
      title,
      description,
      markdown,
      html: page({
        path,
        title,
        description,
        crumbs: [{ name: 'Bets', path }],
        ld: [
          {
            '@type': 'CollectionPage',
            '@id': `${abs(path)}#page`,
            name: `${GAME} bets and house edges`,
            description,
            url: abs(path),
            inLanguage: 'en',
            author: PERSON,
            isPartOf: { '@id': WEBSITE_ID },
            mainEntity: {
              '@type': 'ItemList',
              name: `${GAME} bets`,
              itemListElement: BET_IDS.map((id, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: betName(id),
                url: abs(`bets/${id}/`),
              })),
            },
          },
        ],
        body,
      }),
    });
  }
  for (const id of BET_IDS) {
    const path = `bets/${id}/`;
    const copy = content.bets[id];
    const name = betName(id);
    const variants = offeredIn(id);
    const ties: TiePays[] = id === 'tie' ? [8, 9] : [8];
    const rows: string[] = [];
    const mdRows: string[] = [];
    for (const v of variants)
      for (const t of ties) {
        const ev = evsFor(v, t).find((e) => e.bet === id);
        const pays = betDef(id).payoutText(tableRules(v, t));
        const vn = `${VARIANT_NAME[v]}${id === 'tie' ? `, Tie ${t} to 1` : ''}`;
        rows.push(
          `<tr><th scope="row">${esc(vn)}</th><td>${esc(pays)}</td><td>${ev ? `<strong>${pct(ev.edge)}</strong>` : '—'}</td><td>${ev ? TIER_LABEL[ev.tier] : '—'}</td><td>${ev ? pct(ev.pWin, 2) : '—'}</td></tr>`,
        );
        mdRows.push(
          `| ${vn} | ${pays} | ${ev ? pct(ev.edge) : '—'} | ${ev ? TIER_LABEL[ev.tier] : '—'} | ${ev ? pct(ev.pWin, 2) : '—'} |`,
        );
      }
    const main = evsFor(variants[0]!, 8).find((e) => e.bet === id);
    const lesson = copy?.lessonId ? lessonById.get(copy.lessonId) : undefined;
    const description = describe(copy?.summary ?? `The ${name} bet in ${GAME}.`, [
      main
        ? `House edge ${pct(main.edge)} at ${VARIANT_NAME[variants[0]!]}, exact for 8 decks.`
        : '',
      `How the ${name} bet works in ${GAME_LONG}.`,
    ]);
    const title = `${name} Bet: Payout & House Edge | ${GAME} | ${APP}`;
    const offerNote =
      variants.length < VARIANT_IDS.length
        ? `<p class="muted">Offered at ${variants.map((v) => esc(VARIANT_NAME[v])).join(', ')} tables only.</p>`
        : '';
    const perResolved = main?.edgePerResolved
      ? `<p class="muted">Counting only decided hands (ties excluded): ${pct(main.edgePerResolved)}.</p>`
      : '';
    const body = `<h1>The ${esc(name)} bet</h1>
${copy ? `<p class="lead">${esc(copy.summary)}</p>` : ''}
${offerNote}
<h2>Payout and house edge</h2>
<div class="scroll"><table><thead><tr><th scope="col">Table</th><th scope="col">Pays</th><th scope="col">House edge</th><th scope="col">Rating</th><th scope="col">Wins</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
<p class="muted">House edge per bet placed, exact for a full 8-deck shoe.</p>
${perResolved}
${copy ? `<h2>How it works</h2>${staticLinks(copy.howItWorks, path)}${copy.tip ? `<aside class="tip"><strong>Tip</strong><p>${esc(copy.tip)}</p></aside>` : ''}` : ''}
<p><a class="cta" href="../../#/bets/${id}">Try the ${esc(name)} bet in ${APP} — free, play money</a></p>
${lesson ? `<p>Lesson: <a href="../../learn/${lesson.id}/">${esc(lesson.title)}</a></p>` : ''}
<nav class="pager" aria-label="Bets"><a href="../">All bets</a><a href="../../learn/">The free ${GAME} course</a></nav>`;
    const srcCopy = src.bets[id];
    const markdown = [
      `# The ${name} bet`,
      '',
      copy?.summary ?? '',
      '',
      '| Table | Pays | House edge | Rating | Wins |',
      '|---|---|---|---|---|',
      ...mdRows,
      '',
      srcCopy ? plainMd(srcCopy.howItWorks) : '',
      srcCopy?.tip ? `\nTip: ${srcCopy.tip}` : '',
    ].join('\n');
    pages.push({
      path,
      title: title.length <= 65 ? title : `${name} Bet: Payout & House Edge | ${APP}`,
      description,
      markdown,
      html: page({
        path,
        title: title.length <= 65 ? title : `${name} Bet: Payout & House Edge | ${APP}`,
        description,
        crumbs: [
          { name: 'Bets', path: 'bets/' },
          { name, path },
        ],
        ld: [
          {
            '@type': 'WebPage',
            '@id': `${abs(path)}#page`,
            name: `The ${name} bet`,
            description,
            url: abs(path),
            inLanguage: 'en',
            author: PERSON,
            isPartOf: { '@id': WEBSITE_ID },
          },
        ],
        body,
      }),
    });
  }

  // /glossary/
  {
    const path = 'glossary/';
    const entries = [...content.glossary].sort((a, b) => a.term.localeCompare(b.term));
    const bySlug = new Map(content.glossary.map((g) => [g.slug, g] as const));
    const srcBySlug = new Map(src.glossary.map((g) => [g.slug, g] as const));
    const items = entries
      .map((g) => {
        const lesson = g.lessonId ? lessonById.get(g.lessonId) : undefined;
        const see = (g.see ?? [])
          .filter((s) => bySlug.has(s))
          .map((s) => `<a href="#${s}">${esc(bySlug.get(s)!.term)}</a>`)
          .join(', ');
        return `<dt id="${g.slug}">${esc(g.term)}</dt><dd>${staticLinks(g.definition, path)}${lesson ? `<p>Lesson: <a href="../learn/${lesson.id}/">${esc(lesson.title)}</a></p>` : ''}${see ? `<p class="muted">See also: ${see}</p>` : ''}</dd>`;
      })
      .join('\n');
    const description = clampText(
      `${GAME} glossary: ${entries.length} terms from Punto Banco explained in plain English, from natural, tableau and commission to Big Road, Dragon Bonus and house edge.`,
    );
    const title = `${GAME} Glossary: ${entries.length} Terms Explained | ${APP}`;
    const body = `<h1>${GAME} glossary</h1>
<p class="lead">Every term the course uses, in plain English.</p>
<p><a class="cta" href="../#/glossary">Open the glossary in ${APP} — free, play money</a></p>
<dl class="gloss">${items}</dl>
<nav class="pager" aria-label="More"><a href="../learn/">The free ${GAME} course</a><a href="../bets/">Bets and house edges</a></nav>`;
    const markdown = [
      `# ${GAME} glossary`,
      '',
      ...entries.map((g) => `**${g.term}**: ${plainMd(srcBySlug.get(g.slug)?.definition ?? '')}\n`),
    ].join('\n');
    pages.push({
      path,
      title,
      description,
      markdown,
      html: page({
        path,
        title,
        description,
        crumbs: [{ name: 'Glossary', path }],
        ld: [
          {
            '@type': 'DefinedTermSet',
            '@id': `${abs(path)}#terms`,
            author: PERSON,
            name: `${GAME} glossary`,
            url: abs(path),
            inLanguage: 'en',
            hasDefinedTerm: entries.map((g) => ({
              '@type': 'DefinedTerm',
              '@id': `${abs(path)}#${g.slug}`,
              name: g.term,
              description: plainMd(srcBySlug.get(g.slug)?.definition ?? '').replace(/\*\*/g, ''),
              url: `${abs(path)}#${g.slug}`,
              inDefinedTermSet: `${abs(path)}#terms`,
            })),
          },
        ],
        body,
      }),
    });
  }

  // /systems/
  {
    const path = 'systems/';
    const systems = Object.entries(content.systems);
    const lesson = lessonById.get('betting-systems');
    const items = systems
      .map(([id, s]) => {
        const l = s!.lessonId ? lessonById.get(s!.lessonId) : undefined;
        return `<section id="${id}"><h2>${esc(s!.title)}</h2><p class="lead">${esc(s!.summary)}</p><ul>${s!.rules.map((r) => `<li>${staticLinks(r.replace(/^<p>|<\/p>$/g, ''), path)}</li>`).join('')}</ul>${l ? `<p>Lesson: <a href="../learn/${l.id}/">${esc(l.title)}</a></p>` : ''}</section>`;
      })
      .join('\n');
    const description = clampText(
      `Does Martingale work in ${GAME}? Martingale, Paroli, 1-3-2-6, Fibonacci, D'Alembert and Labouchère: the exact rules, and why no system changes the house edge.`,
    );
    const title = `${GAME} Betting Systems: Martingale & More | ${APP}`;
    const body = `<h1>${GAME} betting systems</h1>
<p class="lead">No betting system changes the house edge. Each bet still loses its edge on average, so the expected cost is the house edge times the total amount bet. What a system changes is how much you bet.</p>
${lesson ? `<p>The numbers (average bet and cost per hour for each system) are in the lesson <a href="../learn/${lesson.id}/">${esc(lesson.title)}</a>.</p>` : ''}
<p><a class="cta" href="../#/play">Run these systems on auto-play in ${APP} — free, play money</a></p>
<p>The systems ${APP} can play for you, with the exact rules it follows:</p>
${items}
<nav class="pager" aria-label="More"><a href="../learn/">The free ${GAME} course</a><a href="../bets/">Bets and house edges</a></nav>`;
    const markdown = [
      `# ${GAME} betting systems`,
      '',
      'No betting system changes the house edge. Expected cost = house edge × total amount bet. What a system changes is how much you bet.',
      '',
      ...Object.entries(src.systems).map(
        ([, s]) =>
          `## ${s.title}\n\n${s.summary}\n\n${s.rules.map((r) => `- ${plainMd(r)}`).join('\n')}\n`,
      ),
    ].join('\n');
    pages.push({
      path,
      title,
      description,
      markdown,
      html: page({
        path,
        title,
        description,
        crumbs: [{ name: 'Betting systems', path }],
        ld: [
          {
            '@type': ['Article', 'LearningResource'],
            '@id': `${abs(path)}#page`,
            headline: `${GAME} betting systems`,
            description,
            url: abs(path),
            inLanguage: 'en',
            author: PERSON,
            isAccessibleForFree: true,
            isPartOf: { '@id': WEBSITE_ID },
            image: OG_IMAGE,
          },
        ],
        body,
      }),
    });
  }

  const files = new Map<string, string>();
  for (const p of pages) files.set(`${p.path}index.html`, p.html);
  files.set('sitemap.xml', sitemapXml(pages));
  files.set('llms.txt', llmsTxt(pages, content, lessons));
  files.set('llms-full.txt', llmsFull(pages, lessons.length));
  return { pages, files };
}

/** Absolute URLs of the SPA root and every static page (the sitemap's set). */
export const siteUrls = (pages: readonly StaticPage[]) => [
  APP_URL,
  ...pages.map((p) => abs(p.path)),
];

function sitemapXml(pages: readonly StaticPage[]): string {
  const urls = siteUrls(pages)
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const summary = (lessons: number) =>
  `${APP} is a free, phone-first web app that teaches ${GAME_LONG} from zero to perfect strategy, part of Know the Odds by creynia. It has a ${lessons}-lesson course, a play-money practice table that shows the exact expected value (EV) of every bet before you place it, a third-card-rule drill and scoreboard (road) explainers. Every payout, house edge and probability is computed exactly from an 8-deck shoe. It is for education only: no betting system or pattern beats the house edge.`;

function llmsTxt(pages: readonly StaticPage[], content: ContentBundle, lessons: Lesson[]): string {
  const by = new Map(pages.map((p) => [p.path, p] as const));
  const link = (path: string, label: string, desc: string) => `- [${label}](${abs(path)}): ${desc}`;
  const out = [
    `# ${APP} — ${GAME_LONG}`,
    '',
    `> ${summary(lessons.length)}`,
    '',
    '## App',
    '',
    `- [${APP} app](${APP_URL}): The interactive app (lessons, practice table with live EV, drills). Free, play money, works offline.`,
    '',
    '## Course',
    '',
    link('learn/', 'Course index', by.get('learn/')!.description),
    ...content.chapters.flatMap((ch) =>
      ch.lessons
        .map((id) => lessons.find((l) => l.id === id))
        .filter((l): l is Lesson => !!l)
        .map((l) => link(`learn/${l.id}/`, l.title, `${ch.title}. ${l.summary}`)),
    ),
    '',
    '## Reference',
    '',
    link('bets/', 'Bets and house edges', by.get('bets/')!.description),
    ...BET_IDS.map((id) => {
      const p = by.get(`bets/${id}/`)!;
      return link(p.path, p.title.split(':')[0]!, content.bets[id]?.summary ?? p.description);
    }),
    link('systems/', 'Betting systems', by.get('systems/')!.description),
    link('glossary/', 'Glossary', by.get('glossary/')!.description),
    '',
    '## Optional',
    '',
    `- [Full text](${APP_URL}llms-full.txt): Every page above as plain markdown, in one file.`,
    `- [Know the Odds](${ORIGIN}/): The umbrella site: free casino-math apps by creynia.`,
    ...OTHER_APPS.map((o) => `- [${o.app}](${ORIGIN}/${o.app}/): ${o.game}.`),
    '',
  ];
  return out.join('\n');
}

function llmsFull(pages: readonly StaticPage[], lessons: number): string {
  const head = `# ${APP} — ${GAME_LONG}: full text\n\n> ${summary(lessons)}\n\nEducation only, play money only. If gambling is hurting you or someone you know, call or text 1-800-GAMBLER (US), or contact your national problem-gambling helpline.\n`;
  return (
    head +
    pages.map((p) => `\n---\n\nSource: ${abs(p.path)}\n\n${p.markdown.trim()}\n`).join('') +
    '\n'
  );
}

/** Head tags for the SPA shell (non-single build only): canonical, JSON-LD, noscript links. */
export function spaHead(description: string): { canonical: string; ld: string; noscript: string } {
  const ld = ldScript([
    {
      '@type': 'WebApplication',
      '@id': `${APP_URL}#app`,
      name: `${APP}: Learn ${GAME}`,
      alternateName: APP,
      url: APP_URL,
      description,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any (web browser)',
      isAccessibleForFree: true,
      inLanguage: 'en',
      image: OG_IMAGE,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      author: PERSON,
      isPartOf: {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'Know the Odds',
        url: `${ORIGIN}/`,
      },
    },
  ]);
  const noscript = `<noscript><div style="max-width:70ch;margin:24px auto;padding:0 16px;color:#f8f1e4;font:17px/1.6 system-ui,sans-serif"><h1>Learn ${GAME} free with ${APP}</h1><p>${APP} teaches ${GAME_LONG} from zero to perfect strategy in short lessons, with a play-money practice table that shows the exact house edge of every bet. The interactive app needs JavaScript, but the whole course is also readable as plain pages.</p><p><a style="color:#e2bf55" href="./learn/">Read the free ${GAME} course</a> · <a style="color:#e2bf55" href="./bets/">Bets and house edges</a> · <a style="color:#e2bf55" href="./systems/">Betting systems</a> · <a style="color:#e2bf55" href="./glossary/">Glossary</a></p></div></noscript>`;
  return { canonical: APP_URL, ld, noscript };
}
