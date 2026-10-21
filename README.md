# baccaratton

A phone-first web app that teaches **Baccarat** (Punto Banco) from zero to perfect strategy, with an interactive table simulator that shows the EV of every bet before you confirm it.

## Use it

**Right away (no setup):** ask the Claude session to publish the single-file build as an Artifact, then tap the link in the Claude app.

### The web app

1. Open **<https://creynia.github.io/baccaratton/>** in Chrome. Every merge to `main` redeploys it from GitHub Actions.
2. Chrome menu (**⋮**) → **Add to Home screen** (or **Install app**) → **Install**. It opens full screen like an app (burgundy icon with a "9" card) and works offline after the first load.

### The offline file

1. In the GitHub app open **baccaratton** → **Releases** → **Latest build** and tap **`baccaratton.html`** (direct link: <https://github.com/creynia/baccaratton/releases/download/latest-build/baccaratton.html>; the app's More tab will also have **Download offline copy** (coming)).
2. Chrome **⋮** → **Downloads** → tap `baccaratton.html`. If asked, open it with **Chrome**, not "HTML Viewer" (that one doesn't run scripts). The file makes no network requests.
3. Progress in this copy is separate from the website's. Use **Settings → Export** and **Import** to move it. The offline file does not update itself: download it again for a newer build.

### Updating

- The installed app shows **"Update available — Reload"** when a new version is ready. Tap **Reload**.
- No toast? Open **Settings → Check for updates** (coming), and compare the build code in **About** (coming) with the latest commit on `main`.
- Still stale: close the app from Recents and reopen it. As a last resort, Chrome **⋮ → Settings → Site settings → All sites → creynia.github.io → Delete & reset** (export your progress first).
- Deploys: **Actions** tab → **Deploy to GitHub Pages** → **Run workflow** if one needs a nudge. A deploy that failed with "deployment in progress" just needs **Re-run failed jobs**. For a fork: **Settings → Pages → Source: GitHub Actions** (use **⋮ → Desktop site** if Settings is hidden).

## Is this gambling advice?

No. baccaratton is for **education only**, with play money only. In Baccarat the house always has an edge, and no betting system, scoreboard pattern or road changes that; the lessons show how big the edge is and which bets cost the least, not how to win.

If gambling is causing harm to you or someone you know, help is free and confidential: call or text **1-800-GAMBLER** (US), or contact your national problem-gambling helpline (for example GamCare **0808 8020 133** in the UK, or Gambling Help Online **1800 858 858** in Australia).

## Status

Under construction: the app shell, tooling and contracts are in place; lessons and the table are being built.

## Development

Requires Node >= 22.12.

```sh
npm ci
npm run dev        # local dev server
npm run check      # lint, typecheck, format check, unit tests
npm run build:all  # dist/ (PWA) and dist-single/baccaratton.html
npm run test:e2e   # Playwright (needs a browser, see CONTRIBUTING.md)
```

Design documents are in [`docs/design/`](docs/design/). Planned future work is listed in [`docs/chips.md`](docs/chips.md). See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

## License

MIT, see [LICENSE](LICENSE).
