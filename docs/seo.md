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

Adding a lesson, bet, term or system needs nothing extra: its page, sitemap entry and llms lines follow.
