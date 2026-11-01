# Static pages, sitemap and llms.txt (SEO)

The app uses hash routing (`#/learn/<id>`), which search engines and LLM crawlers ignore. So the normal
build (`npm run build`, not `build:single`) also writes **static, JS-free HTML pages** at real paths, each
with a link into the app's hash route.

| URL (under `https://creynia.com/baccaratton/`) | Source |
| --- | --- |
| `learn/` | course index: `content/chapters.json` + lesson front matter |
| `learn/<lessonId>/` (one per lesson) | the compiled lesson (same HTML the app renders) |
| `bets/`, `bets/<betId>/` (one per bet) | `content/bets.json` + payouts and exact house edges from the engine and math |
| `systems/` (one anchor per system) | `content/systems.json` |
| `glossary/` (one anchor per term, `#<slug>`) | `content/glossary.json` |
| `odds/` (Banker vs Player vs Tie odds, commission, by deck count) | exact full-shoe EVs from `src/sim/math` (1–8 decks) |
| `third-card-rule/` (Player and Banker drawing chart, how often each case happens) | the engine's `TABLEAU`, `playerDraws`, `bankerDraws` and the 8-deck outcome distribution |
| `sitemap.xml`, `llms.txt`, `llms-full.txt` | all of the above |

- Code: `build/static-site.ts` (pure generator) and `build/vite-plugin-static.ts` (writes the files, and adds
  the canonical link, JSON-LD and a `<noscript>` block to the SPA shell). The single-file build is untouched.
- Interactive blocks get a static stand-in: scenes become a "Try it at the table" link into the app, quizzes
  show the question with the answer in a `<details>`, `tableau` blocks become the drawing-rule table
  generated from the engine. Raw `{{cards}}`, `[[term]]` or `:::` syntax never ships (tests check it).
- The service worker never precaches these files and leaves requests for them to the network, so
  `/baccaratton/learn/<id>/` always shows the real page, never the app shell.
- Shared contract with the other Know the Odds apps: canonical URLs on `https://creynia.com`, `og:image`
  `https://creynia.com/assets/og/baccaratton.jpg` (owned by the landing repo), Person/WebSite JSON-LD ids
  `https://creynia.com/#creynia` and `https://creynia.com/#website`.
- After each deploy to `main`, `.github/workflows/pages.yml` posts the sitemap URLs to IndexNow
  (`scripts/indexnow.mjs`, best effort).
- Tests: `tests/build/static-site.test.ts` (every lesson has a page; one h1, title, description and
  canonical per page; sitemap == pages) and `tests/build/sw.test.ts`.

- Query-shaped pages (wave 2): `odds/`, `third-card-rule/`, plus `systems/` ("does Martingale work?", exact
  per-hour costs from `systemCost` in `src/sim/strategy`), `bets/` (every bet and side bet, lowest edge first),
  `bets/tie/` ("is the Tie bet worth it?") and `learn/welcome/` ("how to play baccarat") answer their question
  in the first paragraph. Every number is computed at build time; `tests/build/static-topics.test.ts` pins them.
- Every page ends with a "Related" block of 3–5 links, picked deterministically from the data (a lesson's topic
  pages and bets, its chapter neighbours; a bet's lesson and sibling bets).

Adding a lesson, bet, term or system needs nothing extra: its page, sitemap entry and llms lines follow.
