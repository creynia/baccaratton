// Static, JS-free HTML pages for search engines and LLMs (docs/seo.md): /learn/, one page per
// lesson, /bets/ (+ one per bet), /glossary/, /systems/, /odds/, /third-card-rule/, plus
// sitemap.xml, llms.txt and llms-full.txt. The text comes from the same compiled content bundle the app renders
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
import { fraction, fullShoeEvs, fullShoeRanks, outcomeDistribution } from '../src/sim/math';
import type { BetEv, Fraction } from '../src/sim/math';
import { DEFAULT_LIMITS, HANDS_PER_HOUR, STRATEGY_NAMES, systemCost } from '../src/sim/strategy';
import type { StrategyId } from '../src/sim/strategy';

// ---------- site facts (shared brief: URL contract) ----------
export const ORIGIN = 'https://creynia.com';
export const APP = 'baccaratton';
export const GAME = 'Baccarat';
export const GAME_LONG = 'Baccarat (Punto Banco)';
export const THEME = '#5c1a2b';
export const APP_URL = `${ORIGIN}/${APP}/`;
export const OG_IMAGE = `${ORIGIN}/assets/og/${APP}.jpg`;
/** GoatCounter page-view pixel (docs/analytics.md); same endpoint as src/app/analytics.ts. */
export const COUNT_URL = 'https://creynia.goatcounter.com/count';
const PERSON_ID = `${ORIGIN}/#creynia`;
const WEBSITE_ID = `${ORIGIN}/#website`;
const COURSE_ID = `${APP_URL}learn/#course`;
const OTHER_APPS = [
  { app: 'crappy', game: 'Craps' },
  { app: 'holdumb', game: "Ultimate Texas Hold'em" },
  { app: 'spinner', game: 'Roulette strategy lab' },
];

/** Output paths (relative to dist) owned by this generator: the SW never precaches these. */
export const STATIC_DIRS = [
  'learn',
  'bets',
  'glossary',
  'systems',
  'odds',
  'third-card-rule',
] as const;
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

/** The Banker's drawing chart (rows: Banker two-card total, columns: Player stood / third card). */
function bankerChartHtml(highlight: ReadonlySet<string> = new Set()): string {
  const head = ten.map((p) => `<th scope="col">${p}</th>`).join('');
  const rows = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((b) => {
      const stood = bankerDraws(b as CardValue, 6, null).draws;
      const cells = ten
        .map((p) => {
          const d = bankerDraws(b as CardValue, 0, p).draws;
          const mark = highlight.has(`b${b}/p${p}`) ? ' class="hl"' : '';
          return `<td${mark}>${d ? 'Draw' : 'Stand'}</td>`;
        })
        .join('');
      const sm = highlight.has(`b${b}/s`) ? ' class="hl"' : '';
      return `<tr><th scope="row">Banker ${b}</th><td${sm}>${stood ? 'Draw' : 'Stand'}</td>${cells}</tr>`;
    })
    .join('');
  return `<div class="scroll"><table class="tableau"><caption>What the Banker does, by the Banker's two-card total (rows) and the Player's third card (columns). Banker 8 or 9 is a natural and always stands.</caption><thead><tr><th scope="col">Banker total</th><th scope="col">Player stood</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function tableauHtml(t: TableauBlockData): string {
  const hl = new Set(t.highlight ?? []);
  const table = t.view !== 'player' ? bankerChartHtml(hl) : '';
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
caption{caption-side:top;text-align:left;padding:4px 0 8px;color:var(--muted);font-size:.9rem}
nav.related{margin:24px 0;padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
nav.related h2{margin:0 0 .3em;font-size:1.1rem}
nav.related ul{margin:0;padding-left:1.2em}
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

export interface RelatedLink {
  path: string;
  label: string;
}

function relatedHtml(from: string, links: readonly RelatedLink[]): string {
  const r = relRoot(from);
  const items = links.map((l) => `<li><a href="${r}${l.path}">${esc(l.label)}</a></li>`).join('');
  return `<nav class="related" aria-label="Related pages"><h2>Related</h2><ul>${items}</ul></nav>`;
}

/** Plain-HTML table with a caption, column headers and a row header in the first cell. */
function dataTable(caption: string, head: readonly string[], rows: readonly string[][]): string {
  const th = head.map((h) => `<th scope="col">${h}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr><th scope="row">${r[0]}</th>${r
          .slice(1)
          .map((c) => `<td>${c}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="scroll"><table><caption>${caption}</caption><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** The same table as markdown (for llms-full.txt); HTML tags are stripped. */
function mdTable(head: readonly string[], rows: readonly string[][]): string {
  const strip = (x: string) =>
    x
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  return [
    `| ${head.map(strip).join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(strip).join(' | ')} |`),
  ].join('\n');
}

function footerHtml(): string {
  const others = OTHER_APPS.map(
    (o) => `<a href="${ORIGIN}/${o.app}/">${esc(o.app)}</a> (${esc(o.game)})`,
  ).join(' · ');
  return `<footer class="site"><div class="wrap"><p><strong>For education only, with play money only.</strong> The house always has an edge, and no betting system changes that. These apps show how big the edge is, not how to beat it.</p><p>If gambling is hurting you or someone you know, call or text <strong>1-800-GAMBLER</strong> (US), or contact your national problem-gambling helpline.</p><p>More from Know the Odds: ${others} · <a href="${ORIGIN}/">creynia.com</a></p></div></footer>`;
}

/** A JS-free, cookieless page-view count for a static page (path like 'learn/welcome/'). */
export function countPixel(path: string): string {
  const p = encodeURIComponent(`/${APP}/${path}`);
  return `<img src="${COUNT_URL}?p=${p}" alt="" width="1" height="1" style="position:absolute;left:-9999px">`;
}

function page(opts: {
  path: string;
  title: string;
  description: string;
  crumbs: Crumb[];
  ld: unknown[];
  ogType?: string;
  body: string;
  /** Dist-relative paths of the "Related" block (3–5 links). */
  related?: readonly RelatedLink[];
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
${opts.related?.length ? relatedHtml(path, opts.related) : ''}
</main>
</div>
${footerHtml()}
${countPixel(path)}
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

  // Bet figures (exact, full shoe), shared by /bets/, /odds/ and the topic pages.
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

  // "Related" blocks: deterministic, from the content data (chapters, bets' and systems' lessons).
  const TOPIC_LABEL: Record<string, string> = {
    'learn/': `The free ${GAME} course`,
    'bets/': `${GAME} bets and side bets: house edges`,
    'systems/': `Does Martingale work? ${GAME} betting systems`,
    'glossary/': `${GAME} glossary`,
    'odds/': `${GAME} odds: Banker vs Player vs Tie`,
    'third-card-rule/': `${GAME} third card rule chart`,
  };
  /** Lessons each topic page belongs to (a lesson page links back to its topic pages). */
  const TOPIC_LESSONS: Record<string, readonly string[]> = {
    'odds/': [
      'settling-bets',
      'expected-value',
      'banker-vs-player',
      'the-tie-bet',
      'table-variants',
      'strategy-lowest-edge',
    ],
    'third-card-rule/': [
      'card-values',
      'naturals-and-player-rule',
      'banker-when-player-stands',
      'banker-third-card-table',
      'third-card-practice',
      'checkpoint-strategy',
    ],
    'systems/': [
      ...new Set(
        Object.values(content.systems)
          .map((x) => x?.lessonId)
          .filter((x): x is string => !!x && x !== 'banker-vs-player' && x !== 'the-tie-bet'),
      ),
      'edge-and-hourly-cost',
      'roads-and-streaks',
    ],
  };
  const lessonPath = (id: string) => `learn/${id}/`;
  const betPath = (id: BetId) => `bets/${id}/`;
  const labelOf = (p: string): string | undefined => {
    if (TOPIC_LABEL[p]) return TOPIC_LABEL[p];
    const m = /^(learn|bets)\/([^/]+)\/$/.exec(p);
    if (!m) return undefined;
    if (m[1] === 'learn') return lessonById.get(m[2]!)?.title;
    return (BET_IDS as readonly string[]).includes(m[2]!)
      ? `The ${betName(m[2] as BetId)} bet`
      : undefined;
  };
  const related = (self: string, candidates: readonly string[]): RelatedLink[] => {
    const out: RelatedLink[] = [];
    for (const p of candidates) {
      const label = labelOf(p);
      if (p === self || !label || out.some((o) => o.path === p)) continue;
      out.push({ path: p, label });
      if (out.length === 5) break;
    }
    return out;
  };
  const lessonRelated = (l: Lesson, i: number): RelatedLink[] => {
    const ch = chapterOf.get(l.chapterId);
    const sib = (ch?.lessons ?? []).filter((id) => id !== l.id && lessonById.has(id));
    const at = ch?.lessons.indexOf(l.id) ?? 0;
    sib.sort(
      (a, b) => Math.abs(ch!.lessons.indexOf(a) - at) - Math.abs(ch!.lessons.indexOf(b) - at),
    );
    return related(lessonPath(l.id), [
      ...Object.keys(TOPIC_LESSONS).filter((t) => TOPIC_LESSONS[t]!.includes(l.id)),
      ...BET_IDS.filter((b) => content.bets[b]?.lessonId === l.id).map(betPath),
      ...sib.map(lessonPath),
      ...[lessons[i + 1], lessons[i - 1], lessons[i + 2]]
        .filter((x): x is Lesson => !!x)
        .map((x) => lessonPath(x.id)),
      'bets/',
      'learn/',
    ]);
  };
  const betRelated = (id: BetId): RelatedLink[] => {
    const lid = content.bets[id]?.lessonId;
    return related(betPath(id), [
      ...(lid ? [lessonPath(lid)] : []),
      ...(id === 'player' || id === 'banker' || id === 'tie' ? ['odds/'] : []),
      ...BET_IDS.filter((b) => b !== id && lid && content.bets[b]?.lessonId === lid).map(betPath),
      'bets/',
      'learn/',
    ]);
  };

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
<p>Reference: <a href="../odds/">Banker vs Player vs Tie odds</a> · <a href="../third-card-rule/">third card rule chart</a> · <a href="../bets/">bets and house edges</a> · <a href="../systems/">betting systems</a> · <a href="../glossary/">glossary</a></p>`;
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
        related: related(path, ['odds/', 'third-card-rule/', 'bets/', 'systems/', 'glossary/']),
      }),
    });
  }

  // /learn/<id>/
  /** Search-facing title/h1/description for lessons that answer a common query (same content). */
  const LESSON_SEO: Record<string, { title: string; h1: string; lead: string }> = {
    welcome: {
      title: `How to Play ${GAME}: Rules for Beginners | ${APP}`,
      h1: `Welcome to ${GAME.toLowerCase()}: how to play`,
      lead: `How to play ${GAME_LONG}:`,
    },
  };
  lessons.forEach((l, i) => {
    const path = `learn/${l.id}/`;
    const ch = chapterOf.get(l.chapterId);
    const prev = lessons[i - 1];
    const next = lessons[i + 1];
    const quizzes = l.blocks.filter((b) => b.kind === 'quiz').length;
    const scenes = l.blocks.filter((b) => b.kind === 'scene').length;
    const seo = LESSON_SEO[l.id];
    const description = describe(
      seo ? `${seo.lead} ${l.summary[0]!.toLowerCase()}${l.summary.slice(1)}` : l.summary,
      [
        `Lesson ${i + 1} of ${total} in a free ${GAME_LONG} course.`,
        quizzes ? `With ${quizzes} quiz question${quizzes > 1 ? 's' : ''}.` : '',
        scenes ? 'Practice on a play-money table.' : '',
      ],
    );
    const title = seo?.title ?? lessonTitle(l.title);
    const blocks = l.blocks.map((b) => blockHtml(b, l.id, path)).join('\n');
    const cta = `<p><a class="cta" href="../../#/learn/${l.id}">Open this lesson in ${APP} — free, play money</a></p>`;
    const pager = `<nav class="pager" aria-label="Lessons">${prev ? `<a href="../${prev.id}/" rel="prev">← ${esc(prev.title)}</a>` : '<span></span>'}<a href="../">All lessons</a>${next ? `<a href="../${next.id}/" rel="next">${esc(next.title)} →</a>` : '<span></span>'}</nav>`;
    const body = `<article>
<h1>${esc(seo?.h1 ?? l.title)}</h1>
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
        related: lessonRelated(l, i),
      }),
    });
  });

  // /bets/ and /bets/<id>/
  const mainEdge = (id: BetId) => {
    const v = offeredIn(id)[0]!;
    return { v, ev: evsFor(v, 8).find((e) => e.bet === id)! };
  };
  {
    const path = 'bets/';
    const rows = BET_IDS.map((id) => {
      const v = offeredIn(id)[0]!;
      const ev = evsFor(v, 8).find((e) => e.bet === id);
      const copy = content.bets[id];
      return `<li><h3><a href="${id}/">${esc(betName(id))}</a></h3><p>${esc(betDef(id).payoutText(tableRules(v, 8)))}${ev ? `. House edge <strong>${pct(ev.edge)}</strong> (${TIER_LABEL[ev.tier]}) at ${esc(VARIANT_NAME[v])}` : ''}.</p>${copy ? `<p class="muted">${esc(copy.summary)}</p>` : ''}</li>`;
    }).join('');
    const byEdge = [...BET_IDS].sort((a, b) =>
      fraction.cmp(mainEdge(a).ev.edge, mainEdge(b).ev.edge),
    );
    const sides = byEdge.filter((id) => betDef(id).kind !== 'main');
    const cheapSide = sides[0]!;
    const dearSide = sides[sides.length - 1]!;
    const e = (id: BetId) => pct(mainEdge(id).ev.edge, 2);
    const answer = `Banker is the cheapest bet in ${GAME.toLowerCase()} at a ${e('banker')} house edge, then Player at ${e('player')}. Every other bet costs more: Tie (8 to 1) costs ${e('tie')}, the cheapest side bet is ${betName(cheapSide)} at ${e(cheapSide)}, and the dearest is ${betName(dearSide)} at ${e(dearSide)}.`;
    const sumHead = ['Bet', 'Pays', 'House edge', 'Rating'];
    const sumRows = byEdge.map((id) => {
      const { v, ev } = mainEdge(id);
      return [
        `<a href="${id}/">${esc(betName(id))}</a>`,
        esc(betDef(id).payoutText(tableRules(v, 8))) +
          (v === 'punto-banco' ? '' : ` (${esc(VARIANT_NAME[v].split(' (')[0]!)} only)`),
        `<strong>${pct(ev.edge)}</strong>`,
        TIER_LABEL[ev.tier],
      ];
    });
    const description = clampText(
      `House edge of every ${GAME} bet and side bet, exact for 8 decks: Banker ${e('banker')}, Player ${e('player')}, Tie ${e('tie')}, pairs, Dragon Bonus, Dragon 7 and Panda 8.`,
    );
    const body = `<h1>${GAME} bets and side bets: the house edge of every bet</h1>
<p class="lead">${esc(answer)}</p>
<p>What each bet pays and what it costs you on average, per bet placed. Exact for a full 8-deck shoe, Tie paying 8 to 1, ties counted as a push for Player and Banker.</p>
<p><a class="cta" href="../#/bets">Compare the bets in ${APP} — free, play money</a></p>
<h2>Which ${GAME.toLowerCase()} bet has the lowest house edge?</h2>
${dataTable(`Every ${GAME.toLowerCase()} bet, lowest house edge first (8 decks, per bet placed)`, sumHead, sumRows)}
<p>Are the side bets worth it? Only as entertainment: each one costs more per bet than Banker or Player. <a href="../odds/">Banker vs Player vs Tie odds</a> · <a href="tie/">Is the Tie bet worth it?</a></p>
<h2>Every bet, one by one</h2>
<ul class="toc">${rows}</ul>
<p>Why the edges are what they are: <a href="../learn/">the free ${GAME} course</a> · <a href="../glossary/">glossary</a></p>`;
    const markdown = [
      `# ${GAME} bets and side bets: the house edge of every bet`,
      '',
      answer,
      '',
      'Exact for a full 8-deck shoe, Tie paying 8 to 1, per bet placed.',
      '',
      mdTable(sumHead, sumRows),
      '',
      ...BET_IDS.map((id) => {
        const v = offeredIn(id)[0]!;
        const ev = evsFor(v, 8).find((e) => e.bet === id);
        return `- [${betName(id)}](${abs(`bets/${id}/`)}): ${betDef(id).payoutText(tableRules(v, 8))}${ev ? `; house edge ${pct(ev.edge)} at ${VARIANT_NAME[v]}` : ''}. ${content.bets[id]?.summary ?? ''}`;
      }),
    ].join('\n');
    const title = `${GAME} Bets & Side Bets: House Edge of Every Bet | ${APP}`;
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
            name: `${GAME} bets and side bets: the house edge of every bet`,
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
        related: related(path, [
          'odds/',
          'bets/tie/',
          lessonPath('pairs-and-dragon-bonus'),
          lessonPath('ez-side-bets'),
          lessonPath('strategy-fun-per-dollar'),
          'systems/',
        ]),
      }),
    });
  }
  /** "Is the Tie bet worth it?": the answer, computed from the exact Tie and Banker figures. */
  function tieSeo() {
    const t8 = mainEdge('tie').ev;
    const t9 = evsFor('punto-banco', 9).find((e) => e.bet === 'tie')!;
    const banker = mainEdge('banker').ev;
    const oneIn = fraction.toFixed(fraction.div(fraction.ONE, t8.pWin), 1);
    const fair = fraction.toFixed(fraction.div(t8.pLose, t8.pWin), 2);
    const times = fraction.toFixed(fraction.div(t8.edge, banker.edge), 0);
    return {
      title: `Is the ${GAME} Tie Bet Worth It? Odds & House Edge | ${APP}`,
      h1: `Is the ${GAME.toLowerCase()} Tie bet worth it?`,
      answer: `No. A tie comes ${pct(t8.pWin, 2)} of the time (about 1 hand in ${oneIn}), but Tie pays only 8 to 1, so its house edge is ${pct(t8.edge, 2)}, about ${times} times the Banker bet's ${pct(banker.edge, 2)}. Where Tie pays 9 to 1 the edge is ${pct(t9.edge, 2)}, still far dearer than Banker. To break even, Tie would have to pay about ${fair} to 1.`,
      description: clampText(
        `Is the Tie bet worth it? Ties come ${pct(t8.pWin, 2)} of hands and pay 8 to 1: a ${pct(t8.edge, 2)} house edge (${pct(t9.edge, 2)} at 9 to 1), against ${pct(banker.edge, 2)} on Banker. Exact for 8 decks.`,
      ),
      fair,
    };
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
    const seo = id === 'tie' ? tieSeo() : undefined;
    const description =
      seo?.description ??
      describe(copy?.summary ?? `The ${name} bet in ${GAME}.`, [
        main
          ? `House edge ${pct(main.edge)} at ${VARIANT_NAME[variants[0]!]}, exact for 8 decks.`
          : '',
        `How the ${name} bet works in ${GAME_LONG}.`,
      ]);
    const title = seo?.title ?? `${name} Bet: Payout & House Edge | ${GAME} | ${APP}`;
    const offerNote =
      variants.length < VARIANT_IDS.length
        ? `<p class="muted">Offered at ${variants.map((v) => esc(VARIANT_NAME[v])).join(', ')} tables only.</p>`
        : '';
    const perResolved = main?.edgePerResolved
      ? `<p class="muted">Counting only decided hands (ties excluded): ${pct(main.edgePerResolved)}.</p>`
      : '';
    const body = `<h1>${esc(seo?.h1 ?? `The ${name} bet`)}</h1>
${seo ? `<p class="lead">${esc(seo.answer)}</p>` : ''}
${copy ? `<p class="${seo ? 'muted' : 'lead'}">${esc(copy.summary)}</p>` : ''}
${offerNote}
<h2>Payout and house edge</h2>
<div class="scroll"><table><caption>The ${esc(name)} bet: payout and house edge by table</caption><thead><tr><th scope="col">Table</th><th scope="col">Pays</th><th scope="col">House edge</th><th scope="col">Rating</th><th scope="col">Wins</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
<p class="muted">House edge per bet placed, exact for a full 8-deck shoe.</p>
${perResolved}
${copy ? `<h2>How it works</h2>${staticLinks(copy.howItWorks, path)}${copy.tip ? `<aside class="tip"><strong>Tip</strong><p>${esc(copy.tip)}</p></aside>` : ''}` : ''}
<p><a class="cta" href="../../#/bets/${id}">Try the ${esc(name)} bet in ${APP} — free, play money</a></p>
${lesson ? `<p>Lesson: <a href="../../learn/${lesson.id}/">${esc(lesson.title)}</a></p>` : ''}
<nav class="pager" aria-label="Bets"><a href="../">All bets</a><a href="../../learn/">The free ${GAME} course</a></nav>`;
    const srcCopy = src.bets[id];
    const markdown = [
      `# ${seo?.h1 ?? `The ${name} bet`}`,
      '',
      seo?.answer ?? '',
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
            name: seo?.h1 ?? `The ${name} bet`,
            description,
            url: abs(path),
            inLanguage: 'en',
            author: PERSON,
            isPartOf: { '@id': WEBSITE_ID },
          },
        ],
        body,
        related: betRelated(id),
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
        related: related(path, ['learn/', 'odds/', 'third-card-rule/', 'bets/', 'systems/']),
      }),
    });
  }

  // /systems/ ("does Martingale work in baccarat?"): exact costs from the strategy module.
  {
    const path = 'systems/';
    const systems = Object.entries(content.systems);
    const lesson = lessonById.get('betting-systems');
    const UNIT = 1000; // a $10 unit, as in the lesson
    const usd = (cents: number) =>
      '$' +
      (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const usd0 = (cents: number) => '$' + (cents / 100).toLocaleString('en-US');
    const COSTED: StrategyId[] = [
      'flat-banker',
      'flat-player',
      'paroli',
      'one-three-two-six',
      'fibonacci',
      'martingale',
      'dalembert',
      'flat-tie',
    ];
    const costs = COSTED.map((id) => ({ id, c: systemCost({ id, unit: UNIT }, 'punto-banco', 8) }));
    const costOf = (id: StrategyId) => costs.find((x) => x.id === id)!.c;
    const flat = costOf('flat-banker');
    const mart = costOf('martingale');
    const banker = mainEdge('banker').ev;
    // Martingale bust: `steps` Banker losses in a row (ties don't count).
    const steps = DEFAULT_LIMITS.martingaleSteps;
    const qLose = fraction.div(banker.pLose, fraction.add(banker.pWin, banker.pLose));
    let pBust = fraction.ONE;
    for (let k = 0; k < steps; k++) pBust = fraction.mul(pBust, qLose);
    const bustEvery = fraction.toFixed(fraction.div(fraction.ONE, pBust), 0);
    const bustCents = UNIT * (2 ** steps - 1);
    const answer = `No. Martingale doesn't change the house edge: every Banker bet still loses ${pct(banker.edge, 2)} on average, whatever came before. What it changes is how much you bet. With a ${usd0(UNIT)} unit, flat Banker bets ${usd0(UNIT)} a hand and costs ${usd(flat.costPerHourCents!)} an hour (${HANDS_PER_HOUR} hands); Martingale's average bet is ${usd(mart.avgBetCents!)}, so it costs ${usd(mart.costPerHourCents!)} an hour, and about once every ${bustEvery} series ${steps} losses in a row lose ${usd0(bustCents)}.`;
    const head = ['System', 'Average bet', 'Expected cost per hour', 'Versus flat Banker'];
    const rowsData = costs.map(({ id, c }) => [
      `<a href="#${id}">${esc(STRATEGY_NAMES[id])}</a>`,
      usd(c.avgBetCents!),
      `<strong>${usd(c.costPerHourCents!)}</strong>`,
      `${(c.costPerHourCents! / flat.costPerHourCents!).toFixed(1)}×`,
    ]);
    const items = systems
      .map(([id, s]) => {
        const l = s!.lessonId ? lessonById.get(s!.lessonId) : undefined;
        return `<section id="${id}"><h3>${esc(s!.title)}</h3><p>${esc(s!.summary)}</p><ul>${s!.rules.map((r) => `<li>${staticLinks(r.replace(/^<p>|<\/p>$/g, ''), path)}</li>`).join('')}</ul>${l ? `<p>Lesson: <a href="../learn/${l.id}/">${esc(l.title)}</a></p>` : ''}</section>`;
      })
      .join('\n');
    const description = clampText(
      `Does Martingale work in ${GAME}? No: at ${usd0(UNIT)} a unit it lifts the average bet to ${usd(mart.avgBetCents!)} and the cost to ${usd(mart.costPerHourCents!)} an hour, against ${usd(flat.costPerHourCents!)} flat, from exact costs.`,
    );
    const title = `Does Martingale Work in ${GAME}? Systems Tested | ${APP}`;
    const h1 = `Does Martingale work in ${GAME.toLowerCase()}? Betting systems tested`;
    const caption = `Exact expected cost of each system: ${usd0(UNIT)} unit, a fresh ${HANDS_PER_HOUR}-hand hour at ${esc(VARIANT_NAME['punto-banco'])}, on Banker (Tie for Flat Tie), with the app's caps and a bankroll that doesn't run out`;
    const body = `<h1>${esc(h1)}</h1>
<p class="lead">${esc(answer)}</p>
<p><a class="cta" href="../#/play">Run these systems on auto-play in ${APP} — free, play money</a></p>
<h2>Does any betting system beat the house edge?</h2>
<p>No betting system changes the house edge. Each bet still loses its edge on average, so the expected cost is the house edge times the total amount bet. What a system changes is how much you bet, and so how much you lose on average.</p>
<h2>What does each baccarat betting system cost per hour?</h2>
${dataTable(caption, head, rowsData)}
<p class="muted">Labouchère and Follow the shoe have no small exact model; ${lesson ? `<a href="../learn/${lesson.id}/">the lesson</a>` : 'the lesson'} gives their simulated cost.</p>
<h2>Why does Martingale feel like it works?</h2>
<p>Most series end with a win that recovers the losses, so Martingale wins small amounts often. The rare long losing run costs ${usd0(bustCents)} at once (${steps} bets from ${usd0(UNIT)} to ${usd0(UNIT * 2 ** (steps - 1))}), and on Banker the commission means even a late win can leave you slightly behind. Averaged out it is the same ${pct(banker.edge, 2)} of everything you bet, on a much bigger total.</p>
${lesson ? `<p>Read the full explanation: <a href="../learn/${lesson.id}/">${esc(lesson.title)}</a>.</p>` : ''}
<h2>The rules of each system</h2>
<p>The systems ${APP} can play for you, with the exact rules it follows:</p>
${items}
<nav class="pager" aria-label="More"><a href="../learn/">The free ${GAME} course</a><a href="../bets/">Bets and house edges</a></nav>`;
    const markdown = [
      `# ${h1}`,
      '',
      answer,
      '',
      'No betting system changes the house edge. Expected cost = house edge × total amount bet. What a system changes is how much you bet.',
      '',
      `## What does each ${GAME.toLowerCase()} betting system cost per hour?`,
      '',
      caption.replace(/&amp;/g, '&') + '.',
      '',
      mdTable(head, rowsData),
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
            headline: h1,
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
        related: related(path, [
          lessonPath('betting-systems'),
          lessonPath('edge-and-hourly-cost'),
          lessonPath('variance-and-bankroll'),
          lessonPath('roads-and-streaks'),
          'odds/',
        ]),
      }),
    });
  }

  /** A topic page (Article + LearningResource) with breadcrumbs under the app root. */
  const topicPage = (o: {
    path: string;
    title: string;
    h1: string;
    description: string;
    body: string;
    markdown: string;
    related: readonly string[];
  }) =>
    pages.push({
      path: o.path,
      title: o.title,
      description: o.description,
      markdown: o.markdown,
      html: page({
        path: o.path,
        title: o.title,
        description: o.description,
        crumbs: [{ name: o.h1.split(':')[0]!, path: o.path }],
        ogType: 'article',
        ld: [
          {
            '@type': ['Article', 'LearningResource'],
            '@id': `${abs(o.path)}#page`,
            headline: o.h1,
            name: o.h1,
            description: o.description,
            url: abs(o.path),
            inLanguage: 'en',
            author: PERSON,
            isAccessibleForFree: true,
            isPartOf: { '@id': WEBSITE_ID },
            image: OG_IMAGE,
          },
        ],
        body: o.body,
        related: related(o.path, o.related),
      }),
    });
  const p2 = (f: Fraction) => pct(f, 2);
  const lessonLinks = (ids: readonly string[], r: string) =>
    ids
      .map((id) => lessonById.get(id))
      .filter((l): l is Lesson => !!l)
      .map((l) => `<a href="${r}learn/${l.id}/">${esc(l.title)}</a>`)
      .join(' · ');

  // /odds/ ("baccarat odds", "banker vs player odds", "banker commission explained")
  {
    const path = 'odds/';
    const get = (list: readonly BetEv[], id: BetId) => list.find((e) => e.bet === id)!;
    const pb = VARIANT_RULES['punto-banco'];
    const atDecks = (decks: number) =>
      fullShoeEvs({ ...pb, tiePays: 8, decks }).filter((e) => e.offered);
    const e8 = evsFor('punto-banco', 8);
    const B = get(e8, 'banker');
    const P = get(e8, 'player');
    const T = get(e8, 'tie');
    const T9 = get(evsFor('punto-banco', 9), 'tie');
    const bShare = fraction.div(B.pWin, fraction.add(B.pWin, B.pLose));
    const evEven = fraction.sub(B.pWin, B.pLose); // Banker at even money
    const breakEven = fraction.sub(fraction.ONE, fraction.div(B.pLose, B.pWin));
    const B4 = get(fullShoeEvs({ ...pb, commission: [1, 25] }), 'banker');
    const ez = get(evsFor('ez', 8), 'banker');
    const s6 = get(evsFor('super-6', 8), 'banker');
    const [cn, cd] = pb.commission;
    const commissionPct = `${(100 * cn) / cd}%`;
    const tenWinPays = ((10 * (cd - cn)) / cd).toFixed(2);
    const answer = `In an 8-deck shoe the Banker wins ${p2(B.pWin)} of hands, the Player ${p2(P.pWin)}, and ${p2(T.pWin)} are ties. After the ${commissionPct} commission the Banker bet has a house edge of ${p2(B.edge)}, the Player bet ${p2(P.edge)} and the Tie bet (8 to 1) ${p2(T.edge)}: Banker is the best bet and Tie the worst.`;
    const probHead = ['Result', 'Share of all hands', 'Share of decided hands (ties left out)'];
    const probRows = [
      ['Banker wins', `<strong>${p2(B.pWin)}</strong>`, p2(bShare)],
      ['Player wins', `<strong>${p2(P.pWin)}</strong>`, p2(fraction.sub(fraction.ONE, bShare))],
      ['Tie', `<strong>${p2(T.pWin)}</strong>`, '—'],
    ];
    const edgeHead = ['Bet', 'Pays', 'House edge per bet', 'Per decided hand'];
    const edgeRows = [
      [
        '<a href="../bets/banker/">Banker</a>',
        esc(betDef('banker').payoutText(pb)),
        `<strong>${pct(B.edge)}</strong>`,
        B.edgePerResolved ? pct(B.edgePerResolved) : '—',
      ],
      [
        '<a href="../bets/player/">Player</a>',
        esc(betDef('player').payoutText(pb)),
        `<strong>${pct(P.edge)}</strong>`,
        P.edgePerResolved ? pct(P.edgePerResolved) : '—',
      ],
      ['<a href="../bets/tie/">Tie</a>', 'Pays 8 to 1', `<strong>${pct(T.edge)}</strong>`, '—'],
      [
        '<a href="../bets/tie/">Tie</a> (where it pays 9 to 1)',
        'Pays 9 to 1',
        `<strong>${pct(T9.edge)}</strong>`,
        '—',
      ],
    ];
    const commHead = ['Banker bet at', 'House edge'];
    const commRows = [
      [`${esc(VARIANT_NAME['punto-banco'])}`, `<strong>${pct(B.edge)}</strong>`],
      ['A 4% commission table', pct(B4.edge)],
      [
        `${esc(VARIANT_NAME.ez)}: ${esc(betDef('banker').payoutText(VARIANT_RULES.ez))}`,
        pct(ez.edge),
      ],
      [
        `${esc(VARIANT_NAME['super-6'])}: ${esc(betDef('banker').payoutText(VARIANT_RULES['super-6']))}`,
        pct(s6.edge),
      ],
      [
        'Even money, no commission (hypothetical)',
        `${pct(fraction.neg(evEven))} (the player would have the edge)`,
      ],
    ];
    const DECKS = [1, 2, 4, 6, 8];
    const byDeck = DECKS.map((d) => {
      const l = atDecks(d);
      return { d, b: get(l, 'banker'), p: get(l, 'player'), t: get(l, 'tie') };
    });
    const deckHead = [
      'Decks',
      'Banker wins',
      'Player wins',
      'Tie',
      'Banker edge',
      'Player edge',
      'Tie edge (8 to 1)',
    ];
    const deckRows = byDeck.map(({ d, b, p, t }) => [
      String(d),
      pct(b.pWin),
      pct(p.pWin),
      pct(t.pWin),
      pct(b.edge),
      pct(p.edge),
      pct(t.edge),
    ]);
    const range = (pick: (x: (typeof byDeck)[number]) => Fraction) => {
      const sorted = [...byDeck].sort((x, y) => fraction.cmp(pick(x), pick(y)));
      const lo = sorted[0]!;
      const hi = sorted[sorted.length - 1]!;
      const n = (d: number) => `${d} deck${d > 1 ? 's' : ''}`;
      return `${pct(pick(lo))} (${n(lo.d)}) to ${pct(pick(hi))} (${n(hi.d)})`;
    };
    const deckNote = `The differences are small. Across 1 to 8 decks the Banker edge runs from ${range((x) => x.b.edge)}, the Player edge from ${range((x) => x.p.edge)} and the Tie edge from ${range((x) => x.t.edge)}. The figures are exact for a fresh shoe; ${APP}'s table deals 8 decks.`;
    const commText = `The Banker hand acts last: under the <a href="../third-card-rule/">third card rule</a> it draws or stands after seeing the Player's third card, so it wins more often. If Banker paid even money it would be a winning bet, ${pct(evEven)} in your favour, the mirror image of the Player bet's −${pct(P.edge)}. The ${commissionPct} commission (a $10 Banker win pays $${tenWinPays}) turns that into a ${pct(B.edge)} house edge. The bet would break even at a commission of ${p2(breakEven)}.`;
    const h1 = `${GAME} odds: Banker vs Player vs Tie`;
    const learnIds = ['banker-vs-player', 'settling-bets', 'the-tie-bet', 'table-variants'];
    const body = `<h1>${esc(h1)}</h1>
<p class="lead">${esc(answer)}</p>
<p><a class="cta" href="../#/bets">See the exact EV of every bet in ${APP} — free, play money</a></p>
<h2>How often do Banker, Player and Tie win?</h2>
${dataTable('Result of a baccarat hand, exact for a full 8-deck shoe', probHead, probRows)}
<h2>What is the house edge on Banker, Player and Tie?</h2>
${dataTable(`House edge per bet placed, exact for 8 decks (ties push on Banker and Player)`, edgeHead, edgeRows)}
<p>Per decided hand leaves out the ties, which push on Banker and Player.</p>
<h2>Banker commission explained: why does Banker pay 5%?</h2>
<p>${commText}</p>
${dataTable('The Banker bet at different tables, 8 decks', commHead, commRows)}
<h2>Do the odds change with the number of decks?</h2>
${dataTable('Baccarat odds by number of decks (fresh shoe, Tie pays 8 to 1)', deckHead, deckRows)}
<p>${esc(deckNote)}</p>
<h2>Learn why</h2>
<p>${lessonLinks(learnIds, '../')}</p>
<p><a class="cta" href="../#/bets">Compare the bets in ${APP} — free, play money</a></p>`;
    const markdown = [
      `# ${h1}`,
      '',
      answer,
      '',
      '## How often do Banker, Player and Tie win?',
      '',
      mdTable(probHead, probRows),
      '',
      '## What is the house edge on Banker, Player and Tie?',
      '',
      mdTable(edgeHead, edgeRows),
      '',
      '## Banker commission explained',
      '',
      commText.replace(/<[^>]+>/g, ''),
      '',
      mdTable(commHead, commRows),
      '',
      '## Do the odds change with the number of decks?',
      '',
      mdTable(deckHead, deckRows),
      '',
      deckNote,
    ].join('\n');
    topicPage({
      path,
      title: `${GAME} Odds: Banker vs Player vs Tie, House Edge | ${APP}`,
      h1,
      description: clampText(
        `${GAME} odds, exact for 8 decks: Banker wins ${p2(B.pWin)}, Player ${p2(P.pWin)}, Tie ${p2(T.pWin)}. House edge: Banker ${p2(B.edge)} after commission, Player ${p2(P.edge)}, Tie ${p2(T.edge)}.`,
      ),
      body,
      markdown,
      related: [
        lessonPath('banker-vs-player'),
        'bets/banker/',
        'bets/tie/',
        lessonPath('table-variants'),
        'third-card-rule/',
      ],
    });
  }

  // /third-card-rule/ ("baccarat third card rule", "drawing rules chart"), from the engine.
  {
    const path = 'third-card-rule/';
    const below8 = ten.filter((t) => t < 8);
    const pDraw = below8.filter((t) => playerDraws(t, 0).draws);
    const pStand = below8.filter((t) => !playerDraws(t, 0).draws);
    const bDraw = below8.filter((b) => bankerDraws(b, 6, null).draws);
    const bStand = below8.filter((b) => !bankerDraws(b, 6, null).draws);
    const answer = `If either hand has 8 or 9 on its first two cards (a natural), both hands stand. Otherwise the Player draws a third card on ${valueList(pDraw)} and stands on ${valueList(pStand)}. If the Player stood, the Banker draws on ${valueList(bDraw)} and stands on ${valueList(bStand)}; if the Player drew, the Banker's move depends on its own total and the Player's third card, as in the chart below.`;
    const playerHead = ["Player's two-card total", 'The Player'];
    const playerRows = ten.map((t) => [
      String(t),
      t >= 8
        ? 'Natural: both hands stand'
        : playerDraws(t, 0).draws
          ? '<strong>Draws</strong> a third card'
          : 'Stands',
    ]);
    const bankerLines = [
      `When the Player stood: Banker ${valueList(bDraw)} draws, Banker ${valueList(bStand)} stands.`,
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(bankerRowText),
    ];
    const dist = outcomeDistribution(fullShoeRanks(8));
    let nat = 0n;
    let pd = 0n;
    let bd = 0n;
    for (const c of dist.cells) {
      if (c.playerCards === 2 && c.bankerCards === 2 && (c.playerTotal >= 8 || c.bankerTotal >= 8))
        nat += c.weight;
      if (c.playerCards === 3) pd += c.weight;
      if (c.bankerCards === 3) bd += c.weight;
    }
    const share = (w: bigint) => p2(fraction.frac(w, dist.total));
    const freqHead = ['What happens', 'How often (8 decks)'];
    const freqRows = [
      ['A natural (8 or 9 on two cards) ends the hand', share(nat)],
      ['The Player draws a third card', share(pd)],
      ['The Banker draws a third card', share(bd)],
    ];
    const h1 = `${GAME} third card rule: drawing rules chart`;
    const learnIds = [
      'naturals-and-player-rule',
      'banker-when-player-stands',
      'banker-third-card-table',
      'third-card-practice',
    ];
    const body = `<h1>${esc(h1)}</h1>
<p class="lead">${esc(answer)}</p>
<p><a class="cta" href="../#/drill">Practise the third card rule in the ${APP} Drill — free, play money</a></p>
<h2>When does the Player draw a third card?</h2>
${dataTable("The Player's third card rule (no natural on either side)", playerHead, playerRows)}
<h2>When does the Banker draw a third card?</h2>
${bankerChartHtml()}
<ul>${bankerLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<h2>How often does a hand get a third card?</h2>
${dataTable('How often each case happens, exact for a full 8-deck shoe', freqHead, freqRows)}
<h2>Do you need to know the third card rule to play?</h2>
<p>No. Nobody decides anything at the table: the dealer applies these rules to both hands. They are still worth knowing, because they explain why the Banker wins more often and pays a commission: see <a href="../odds/">Banker vs Player vs Tie odds</a>.</p>
<h2>Learn it step by step</h2>
<p>${lessonLinks(learnIds, '../')}</p>
<p><a class="cta" href="../#/rules">Open the drawing rules in ${APP} — free, play money</a></p>`;
    const markdown = [
      `# ${h1}`,
      '',
      answer,
      '',
      '## When does the Player draw a third card?',
      '',
      mdTable(playerHead, playerRows),
      '',
      '## When does the Banker draw a third card?',
      '',
      ...bankerLines.map((l) => `- ${l}`),
      '',
      '## How often does a hand get a third card?',
      '',
      mdTable(freqHead, freqRows),
      '',
      'Nobody decides anything at the table: the dealer applies these rules to both hands.',
    ].join('\n');
    topicPage({
      path,
      title: `${GAME} Third Card Rule: Drawing Rules Chart | ${APP}`,
      h1,
      description: clampText(
        `The ${GAME.toLowerCase()} third card rule as a chart: the Player draws on ${valueList(pDraw)}, and the Banker by its total and the Player's third card. Naturals, every case, how often.`,
      ),
      body,
      markdown,
      related: [...learnIds.map(lessonPath), 'odds/'],
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
      return link(
        p.path,
        `${content.bets[id]?.name ?? id} bet`,
        content.bets[id]?.summary ?? p.description,
      );
    }),
    link('odds/', 'Odds: Banker vs Player vs Tie', by.get('odds/')!.description),
    link('third-card-rule/', 'Third card rule chart', by.get('third-card-rule/')!.description),
    link('systems/', 'Betting systems: does Martingale work?', by.get('systems/')!.description),
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
  const noscript = `<noscript><div style="max-width:70ch;margin:24px auto;padding:0 16px;color:#f8f1e4;font:17px/1.6 system-ui,sans-serif"><h1>Learn ${GAME} free with ${APP}</h1><p>${APP} teaches ${GAME_LONG} from zero to perfect strategy in short lessons, with a play-money practice table that shows the exact house edge of every bet. The interactive app needs JavaScript, but the whole course is also readable as plain pages.</p><p><a style="color:#e2bf55" href="./learn/">Read the free ${GAME} course</a> · <a style="color:#e2bf55" href="./odds/">Banker vs Player vs Tie odds</a> · <a style="color:#e2bf55" href="./third-card-rule/">Third card rule chart</a> · <a style="color:#e2bf55" href="./bets/">Bets and house edges</a> · <a style="color:#e2bf55" href="./systems/">Betting systems</a> · <a style="color:#e2bf55" href="./glossary/">Glossary</a></p></div></noscript>`;
  return { canonical: APP_URL, ld, noscript };
}
