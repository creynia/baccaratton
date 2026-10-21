# baccaratton

A phone-first web app that teaches **Baccarat** (Punto Banco) from zero to perfect strategy, with an interactive table simulator that shows the EV of every bet before you confirm it.

Status: under construction. The app shell, tooling and contracts are in place; lessons and the table are being built.

## Use it

- **Right away (no setup):** ask the Claude session to publish the single-file build as an Artifact, then tap the link in the Claude app.
- **Open it:** <https://creynia.github.io/baccaratton/>. Every merge to `main` redeploys it from GitHub Actions.
- **Add to Home screen (Android/Chrome):** open the link, tap the Chrome menu (three dots), then **Add to Home screen** (or **Install app**). It launches full screen (burgundy icon with a "9" card) and works offline after the first load.
- **Download one offline file:** in the GitHub app open baccaratton, then **Releases**, then **Latest build**, and tap `baccaratton.html` (also linked from the site's Home screen and More tab). Open it from Chrome's Downloads list and choose **Chrome**, not "HTML Viewer" (it doesn't run scripts). It makes no external requests. Progress in this copy is separate from the website copy, so use Settings, then Export/Import to move it.
- **Updating:** the installed app shows "Update available, Reload". If it doesn't, open **Settings, Check for updates** and compare the build code in **About** with the latest commit. As a last resort close the app from Recents and reopen it, or in Chrome: **⋮, Settings, Site settings, All sites, creynia.github.io, Delete & reset**.
- **If a deploy needs a nudge:** **Actions** tab, **Deploy to GitHub Pages**, **Run workflow**. A deploy that fails with "deployment in progress" can be re-run from the same tab. For a fork: **Settings, Pages, Source: GitHub Actions** (use **⋮, Desktop site** if Settings is hidden).

## Is this gambling advice?

No. baccaratton is for education. In Baccarat the house always has an edge, and no betting system or scoreboard pattern changes that; the lessons show you how big the edge is and which bets cost the least, not how to win. Play money only here. If gambling is causing you or someone you know harm, call **1-800-GAMBLER** (US) or find local resources at your national problem-gambling helpline.

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
