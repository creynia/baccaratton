# baccaratton: App & Repo Architecture

Status: design spike, ready for reconciliation into `decisions.md`.
Companion docs: `docs/design/curriculum.md` (lessons, quizzes, scenes, the bet
reference table) and `docs/design/simulator.md` (engine, exact EV, SVG table,
`SceneConfig`, betting systems, roads data).

**Ownership of this doc.** It owns the boundaries between modules, the app
shell, routes and screens, the content pipeline, the job transport (how the UI
runs long computations, not the math inside them), tooling, CI, delivery and
the work-package plan. The simulator doc owns everything *inside* `src/sim/**`
(types, payloads, algorithms, the internal chunk split). Where the two disagree
on something inside `src/sim/**`, the simulator doc wins; `decisions.md` beats
both.

**The constraint behind most decisions:** the user has only an Android phone.
Nothing in the build, deploy or use path may need a computer, the app must work
fully offline, and the single offline HTML file has to stay small and fast on a
mid-range phone.

**Reference implementation:** holdumb (`/home/user/holdumb`,
https://creynia.github.io/holdumb/). The default for every file is **"copy
holdumb and rename"** (`holdumb` → `baccaratton`, `holdumb:` storage prefixes
→ `baccaratton:`, navy `#0b2e4a` → burgundy `#5c1a2b`). §11 lists every file
as verbatim, adapt, replace or delete.

**User answers already in `decisions.md`:** D1 the orchestrator merges, repo
public, Pages via GitHub Actions; D2 8 decks, Banker 1:1 less 5% commission,
Tie 8:1, EZ Baccarat and Super 6 as Settings variants; D3 simulate Player /
Banker Pair, Dragon 7 / Panda 8 (EZ only) and Dragon Bonus (both sides); D4
Bead plate + Big Road in the simulator, derived roads explained only.
From brief update 1: D5 72 hands/hour; D6 the EV sheet shows **full-shoe** EV,
with an optional "Shoe tracker" (off by default) showing live exact
current-shoe EV; D7 quick flip only, **no squeeze feature**; D8 real shoe only
(8 decks, burn by the first card's value, cut card 16 from the end, reshuffle
after the shoe), **no continuous-shuffle setting**; D9 every betting system is
an auto-play preset compared on one seed; D10 burgundy `#5c1a2b` + gold; D11
tabs Learn · Play · Drill · More; D12 Artifact first, then Pages, and
Pages/Actions are already enabled, so **WP0 ships `ci.yml` and `pages.yml`**
and every push to `main` deploys from the first merge.
After the design review (decisions.md §3): D33 renames (`variant`, `tiePays`,
`?variant=`, `?tie=`, one `simulate` job with `sessions`, `previewSlip`, Drill
`winner` mode), D34 markup (tableau `full`, `TableauCellId`, quiz `hand` as
YAML arrays, roads parsed by `parseRoadString`), D35 (`SessionPanel` and the
tappable commission line are table-ui's), D37 (WP0 additions, batons), D29
(Drill categories, `?cat=`, `?focus=misses`) and D24 (content split) are
applied below.

---

## 1. Stack

### 1.1 Carries over unchanged from holdumb

Versions verified on 2026-10-21 by `npm ci` of holdumb's lockfile in
`/tmp/baccaratton-scratch/architecture/wk` (Node 22.22.0, npm 10.9.4). A full
copy of holdumb (`/tmp/baccaratton-scratch/architecture/holdumb`) then ran
`npm run build:all` (14 s), `npm run check` (46 files / 549 tests green, 64 s)
and the `smoke`, `single-file` and `offline` e2e specs against
`/opt/pw-browsers/chromium-1194` (16 passed). So the toolchain is known green.

WP0 copies holdumb's `package.json` dependency block, `overrides` and
`engines` **verbatim** (name → `baccaratton`), then runs
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` once to regenerate the
lockfile for the new name. It must not bump any range.

| Concern | Choice | Range in package.json (installed) |
| --- | --- | --- |
| Runtime | Node 22 (`.nvmrc` = `22`, `engines.node >=22.12`) | 22.22.0 in session |
| Bundler | Vite | `^8.3.4` (8.3.4) |
| UI | Preact + hooks. No router, state, chart or CSS lib | `preact@^10.29.8` (10.29.8), **the only runtime dep** |
| JSX plugin | `@preact/preset-vite` | `^2.10.6` (2.10.6) |
| Single file | `vite-plugin-singlefile` | `^2.3.3` (2.3.3) |
| Language | TypeScript `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` | `~6.0.3` (6.0.3; not 7, typescript-eslint peer range) |
| Build-time content | `marked` + `yaml` (dev only, never shipped) | `^18.1.1` (18.1.1), `^2.9.1` (2.9.1) |
| Unit tests | Vitest, projects `node` and `dom` (`happy-dom`) | `^5.0.4` (5.0.5), `happy-dom@^21.0.1` (21.0.1) |
| Component tests | `@testing-library/preact` | `^3.2.4` (3.2.4) |
| E2E | Playwright, Chromium only, **exact pin** + `overrides.playwright-core` | `1.56.1` (matches `/opt/pw-browsers/chromium-1194`) |
| A11y | `@axe-core/playwright` | `^4.13.0` (4.14.0) |
| Lint | ESLint flat config, `typescript-eslint` `recommendedTypeChecked`, `eslint-config-prettier`, `globals`, `@eslint/js` | `^10` (10.12.0), `^8.71.2` (8.71.2), `^10.1.8`, `^17.13.0`, `^10` (10.0.1) |
| Format | Prettier `{ "singleQuote": true, "printWidth": 100 }` | `^3` (3.9.10) |
| Node types | `@types/node@^22` | 22.20.5 |

Nothing is added: no router lib, no state lib, no chart lib, no zod, no
Workbox, no Comlink, no tsx. Nothing is removed from the dev set either (the
same-thread job client still needs nothing new; Plan B in §4.4 needs nothing new).

### 1.2 What changes for baccaratton

| Area | holdumb | baccaratton | Why |
| --- | --- | --- | --- |
| EV compute | Async EV client over a **Web Worker** (flop EV is 10^6 showdowns), inline IIFE worker in the single file | **No worker by default (Plan A).** Bet previews are **synchronous** calls into `src/sim/math` (exact EV of every bet over the current shoe composition is a small enumeration). Only long multi-hand simulations go through a time-sliced **same-thread** job client in `src/sim/jobs` | Decided in D18 (exact full recompute ≈ 1.4 ms desktop); §4.4 keeps the way back. Deletes ~600 lines of worker plumbing, one copy of engine + math in the single file, the `#ev-worker` alias and its three configs |
| Vite config | `#ev-worker` alias, `worker.format` | Removed. Back to crappy's three-line plugin list | Plan A |
| Precomputed tables | `src/sim/math/tables/` + `gen:tables` | Not expected. `gen:tables` script kept as a no-op (`--passWithNoTests`) so a table can be added without touching `package.json` | Baccarat EV per composition is milliseconds |
| Content format | `:::math`, `:::tip`, `scene`, `quiz`, `chart`, `{{As Kd}}`, quiz `hand: {hole, board}` | Same base, `chart` replaced by **` ```tableau `** (drawing-rule chart) and **` ```roads `** (static scoreboard), quiz `hand: {player: [..], banker: [..]}`, inline cards `{{Kh 7d}}` (with an optional total, §3.2) | Baccarat lessons talk about hands, totals, the third-card rule and scoreboards |
| Reference data | `bets.json`, `hands.json`, `strategy.json` | `bets.json` keyed by **bet id** (every simulated bet), `systems.json` keyed by betting-system id. `hands.json` dropped | Numbers still come from engine/math, never the JSON |
| Screens and tabs | Learn · Play · Drill · More; Strategy charts, Hands | Learn · Play · Drill · More; Drill = **third-card-rule trainer**. New screens: **Drawing rules** (`#/rules`), **Roads** explainer (`#/roads`), Bets & paytables (`#/bets`). Hands and Strategy screens dropped | §2 |
| Settings | `paytable`, `anteUnitCents`, `fourColorDeck`, `confirmCostlyMoves` | `variant` (`punto-banco` / `ez` / `super-6`), `tiePays` (8 or 9), `unitCents`, `handsPerHour`, `confirmCostlyBets`, `practice`, `shoeTracker`, `showRoads`, `fourColorDeck` (no squeeze, no continuous shuffle: D7, D8) | §2.4 |
| Theme colour | navy `#0b2e4a` | **burgundy `#5c1a2b`** felt, gold `#d4af37` trim (D10) | Tells three installed apps apart (crappy green `#0b3d2e`, holdumb navy) |
| Single-file budget | target 600 kB, fail 800 kB (holdumb measures 423,095 B) | **target 450 kB, fail 600 kB** | No worker copy, no tables (§5.4) |
| Build info, update path, suit glyphs (`U+FE0E`), Settings → Check for updates | | Unchanged | |

---

## 2. Routes and screens

### 2.1 Routes (hash based, `src/app/routes.tsx`)

| Hash | Screen | Contents |
| --- | --- | --- |
| `#/` | Home | "Continue" (next unfinished lesson), progress ring, quick links (Learn, Play, Drill, Bets), "Download offline copy" and "Install app" when applicable |
| `#/learn` | Lesson list | A **"Drawing rules" card at the top** (→ `#/rules`), then chapters in order, including the three Perfect-strategy chapters (lowest edge / practical / fun per dollar). All lessons open; status done / in progress / new |
| `#/learn/:lessonId` | Lesson | Prose, `:::math`, `:::tip`, inline cards, scenes, tableau and roads blocks, quizzes, Prev / Next, "Mark complete" |
| `#/play` | Sandbox | Full simulator: chip rack, bet spots (Player, Banker, Tie, Pairs, Dragon/Panda per variant), **EV sheet of every bet before Deal** (full-shoe EV, D6; with Shoe tracker on, the live exact current-shoe EV beside it), deal with quick-flip draws (no squeeze, D7), settlement, **Bead plate + Big Road** strip (D4), shoe meter (cards left, cut card at 16 from the end, burn shown at the start of each shoe, D8), auto-play panel with systems compare and bankroll chart. Query: `?seed=`, `?shoe=<forced card list>`, `?variant=punto-banco\|ez\|super-6`, `?tie=8\|9`, `?system=<strategy id>`, `?speed=instant` (tests). Drill answers and lessons open a preset deal here |
| `#/drill` | Drill (tab) | **Third-card-rule trainer.** Deals two cards to each side; you answer **"Does the Player draw?" Draw · Stand**, then (if relevant, after the Player's third card is shown) **"Does the Banker draw?" Draw · Stand**; in `winner` mode the whole hand is shown and you answer **"Who wins? Player / Banker / Tie"**. Instant right/wrong, the rule that applied in words ("Banker 5 draws when the Player's third card is 4–7"), the highlighted tableau cell, "See the chart" (→ `#/rules?highlight=`) and "Play it out" (→ `#/play?shoe=`). `payout` mode: "Banker wins $25: what's paid?" ($23.75, commission). Spots carry a `category` (the 14 `DrillCategoryId`s of curriculum.md §9.1); `DrillMode` groups them (D29): `player` ⊇ `natural`, `player-draw`; `banker` ⊇ `banker-*`; `winner` = `who-wins`; `payout` = `settle`; `hand-total` and `which-bet` appear only in `mixed`. There is no `total` mode. Query: `?mode=player\|banker\|winner\|payout\|mixed`, `?cat=<DrillCategoryId>` (one category), `?focus=misses` (replay recent misses; tableau links may pass `?focus=<TableauCellId>`). Persisted: best streak, accuracy **per category**, recent misses ("Review misses" → `?focus=misses`). Spot generation and grading are pure functions in `src/sim` (`src/sim/strategy/drill.ts`, D22) built on the engine's own draw functions |
| `#/rules` | Drawing rules (no tab) | The Player rule and the Banker tableau (Banker total 0–7 × Player third card none/0–9), naturals, totals mod 10, card values. Generated from the engine's `playerDraws` / `bankerDraws`, never typed by hand. `?highlight=<TableauCellId>` deep-links a cell (simulator `TableauCellId`: `b4/p7` Banker 4 / Player third card 7, `b6/s` Banker 6 / Player stood, `p5` Player total 5; D34), e.g. `#/rules?highlight=b5/p4`. Generated from the engine's literal `TABLEAU`. Tap a cell → a Drill on that cell or a forced deal in Play |
| `#/bets` | Bets & paytables | Every simulated bet: payout per variant, house edge per bet placed (D14) as the headline, the per-resolved figure in the detail (D32), probability of win/lose/push, tier badge, "Try it". Variant switch (`punto-banco` / `ez` / `super-6`, plus Tie 8:1 / 9:1) defaults to the current setting |
| `#/bets/:betId` | Bet detail | Copy from `bets.json`, paytable, edge, outcome probabilities from math, "Learn" and "Try it" links |
| `#/roads` | Roads explainer (no tab) | What the scoreboard is: Bead plate and Big Road drawn by the real `ui/Scoreboard` from a seeded shoe, "deal 10 more" button, how Ties and Pairs are marked, a short honest panel ("past results don't change the next hand", link to the gambler's-fallacy lesson), and a static picture + text of the derived roads (Big Eye Boy, Small Road, Cockroach Pig), explained only (D4) |
| `#/glossary` | Glossary | Search, `?term=slug` anchors |
| `#/settings` | Settings | §2.4 |
| `#/about` | About | Version, build sha, license, disclaimer, help lines |
| `#/more` | More | Drawing rules, Bets & paytables, Roads, Glossary, Settings, About, offline link |
| anything else | Not found | Link home |

Bottom tab bar on phones: **Learn · Play · Drill · More** (D11; Home is the
title tap). Top nav at ≥ 768 px with the same four items. The `More` tab
is active for `/more`, `/rules`, `/bets`, `/roads`, `/glossary`, `/settings`,
`/about`.

**Card notation** in URLs and content: rank `A23456789TJQK` + suit `shdc`
(`Kh`, `Td`, `As`). The parser is the engine's `parseCards`, so app, content
and tests share one definition (WP0 implements it for real). Baccarat values
(A = 1, 2–9 face, T/J/Q/K = 0) come from the engine's `cardValue`.

**Forced shoe in URLs:** `?shoe=` is the draw order, comma or space separated,
in the engine's dealing order (P1, B1, P2, B2, P3?, B3?), validated by the
engine. Simulator.md owns the exact semantics (burn cards, whether a forced
prefix sits on top of a seeded shoe).

### 2.2 Router

Copy `src/app/router.ts` verbatim (`parseHash`, `matchPath`, `navigate`,
`useRoute`, `consumeFreshNav` scroll restore).

### 2.3 Lesson ↔ simulator

As in holdumb: the **scene runner lives in `src/sim/scene`** (steps,
`completeWhen`, forced shoes, restrictions). The app's `LessonScene` renders
`<Simulator scene onEvent settings>` lazily (IntersectionObserver) and persists
progress from `step-completed` / `scene-completed` events. Baccarat scenes are
**bet-shaped, not decision-shaped**: steps like "put $10 on Banker",
"open the EV sheet for Tie", "deal", "watch the Banker draw", "run 200 hands
of Martingale". Simulator.md owns `SceneConfig`; content authors write only
that schema (holdumb lesson D25: no curriculum-private scene dialect).

### 2.4 Storage and settings

One localStorage key, **`baccaratton:v1`**, through holdumb's `createStorage()`
(probe, then in-memory fallback with the "progress won't be saved in this copy"
banner), `load()` validates, migrates by `version`, backs up unreadable data,
never throws, read-only on newer versions; `save()` debounced 300 ms. Export /
Import is the base64 JSON code.

```ts
interface PersistedV1 {
  version: 1;
  lessons: Record<LessonId, LessonProgress>; // holdumb shape (quizzes incl. firstTry, scenes)
  settings: Settings;
  drill: {
    bestStreak: number;
    byCategory: Partial<Record<DrillCategoryId, { answered: number; correct: number }>>; // D29
    recentMisses: string[]; // spot codes (strategy/drill.ts spotCode), newest first, max 50
  };
  sandbox?: unknown; // opaque snapshot owned by sim/ui: shoe (remaining cards + position), bets,
                     // bankroll in cents, road history; restored exactly mid-shoe
}

// src/sim/ui/types.ts (created in WP0 per D37; simulator.md §4 owns; app Settings extends it)
interface SimSettings {
  animationSpeed: 'normal' | 'fast' | 'instant'; // OS reduced motion forces 'instant'
  fourColorDeck: boolean;          // default false
  variant: VariantId;              // 'punto-banco' (5% commission, default) | 'ez' (no commission, Banker 3-card 7 pushes) | 'super-6' (Banker 6 pays 1:2) (D13)
  tiePays: TiePays;                // 8 (default) | 9 (D13); one shoe only: 8 decks, burn, cut card 16 from the end (D8)
  unitCents: number;               // default 1_000 ($10); per-hour lines and "units" scale by it
  handsPerHour: number;            // default 72 (D5)
  confirmCostlyBets: boolean;      // default true: red-tier bets (e.g. Tie, most side bets) need a second tap
  practice: boolean;               // default false: hide EV until the hand settles
  shoeTracker: boolean;            // default false (D6): show live exact current-shoe EV next to full-shoe EV; the counting lesson's scene turns it on
  showRoads: boolean;              // default true: Bead plate + Big Road strip in Play
}
// src/app/settings.ts
interface Settings extends SimSettings {
  theme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  defaultBankrollCents: number;    // default 50_000 ($500)
}
```

There is deliberately **no** squeeze toggle (D7) and **no** continuous-shuffle
toggle (D8). Side bets offered follow the variant: Dragon 7 / Panda 8 only appear with
`variant: 'ez'` (D3); offered bets come from the engine's `betsOffered(rules)`. Settings shows each variant's Banker edge next to its
name, computed by math (never typed). Settings flow into the simulator as
props; `src/sim/**` never reads storage.

### 2.5 Layout and quality bars (playbook §4, unchanged)

Mobile first, single column, max width 42 rem, 16 px gutters, tap targets ≥ 44
px, no horizontal scroll at 360 px, OS reduced motion forces instant
animation, light and dark tokens (`:root`, `@media (prefers-color-scheme:
dark) { :root:not([data-theme=light]) }`, `:root[data-theme=dark]`), system
fonts only, axe with no serious or critical issues. **Landscape (844×390)**
keeps **Deal** visible: the EV sheet, step panel and roads go in a side rail.
Portrait: felt (two hands + bet spots) on top, chip rack and Deal fixed above
the tab bar, roads strip collapsible under the felt. Money never wraps at the
minus sign (`white-space: nowrap` on money, a holdumb chip).

---

## 3. Content authoring and validation

### 3.1 Files

```
content/
  chapters.json   [{ id, title, summary, lessons: LessonId[] }]
  glossary.json   [{ term, slug?, definition (md), see?, seeAlso? }]
  bets.json       { [betId]: { name?, summary, howItWorks (md), tip?, lessonId? } }
  systems.json    { [systemId]: { title, summary, rules: string[] (md), lessonId? } }  // Martingale, Paroli, 1-3-2-6, follow-the-shoe…
  lessons/NN-slug.md
  README.md
tests/fixtures/content/_sample-{chapters,glossary,bets,systems}.json   placeholders (holdumb location)
```

Numbers are never written in the JSON files: payouts, edges, probabilities and
tableau cells come from engine and math, so they cannot drift. Lesson prose
does quote numbers; those are pinned by the content tests (§3.4).

### 3.2 Lesson format (holdumb's, with baccarat blocks)

````markdown
---
id: banker-draws
title: When the Banker draws
chapter: third-card-rule
summary: The Banker's rule depends on the Player's third card.
minutes: 6
---

The Player has {{4h 2c 9d}} (total 5) and the Banker shows {{Kd 5s}}. Does the Banker draw?

:::math Why Banker beats Player
…exact fractions…
:::

:::tip
Nobody decides anything at the table: the dealer follows the rule for both hands.
:::

```tableau
view: banker          # player | banker | full (D34)
highlight: [b5/p9]    # TableauCellId: Banker 5 / Player third card 9; b6/s = Player stood; p5 = Player total
```

```roads
results: BBPBTPPPB    # parsed by engine parseRoadString (engine/roads.ts), D34
view: [bead, big]
caption: Four Banker wins in a row tell you nothing about the next hand.
```

```scene
# SceneConfig per simulator.md (money in cents, forced shoe on the step that uses it)
```

```quiz
- q: Does the Banker draw?
  hand: { player: [4h, 2c, 9d], banker: [Kd, 5s] }   # YAML arrays (D34)
  options: [Draw, Stand]
  answer: 1
  explain: Banker 5 draws only when the Player's third card is 4–7.
````

| Construct | New vs holdumb? | Compiles to | Validation (build fails on error) |
| --- | --- | --- | --- |
| Front matter `id, title, chapter, summary, minutes` | no | `Lesson` fields | id unique, equals the file slug, listed in exactly one chapter, chapter matches |
| `:::math Title … :::`, `:::tip … :::` | no | math / tip blocks | title required, containers closed |
| `[[term]]`, `[[term\|label]]` | no | glossary link | term exists |
| `{{Kh 7d}}` inline cards | same syntax, baccarat ranks | `<span class="cards" role="img" aria-label="King of hearts, Seven of diamonds (total 7)">` with text-presentation suit glyphs | every code parses with `parseCards`; no duplicate inside a group. The aria label (and an optional visible badge with `{{Kh 7d =}}`) adds the baccarat total from the engine's `handTotal`; `{{Kh 7d =7}}` asserts the total and fails the build if wrong |
| ` ```scene ` YAML | no | scene block | `validateScene` from `src/sim/scene` (forced shoe valid for the rule preset, ids exist, every `completeWhen` known, no dead ends, Deal locked while a step waits for a bet) |
| ` ```quiz ` `{ id?, q, options, answer (0-based), explain, hand? }` | `hand` is `{ player: Card[], banker: Card[] }` as YAML arrays (D34) | quiz block | ≥ 2 options, no duplicates, answer in range, ids unique (default `<lessonId>-q<n>`), `hand` cards valid, disjoint, 2–3 cards per side and **consistent with the drawing rules** (a 3rd card only where the rule draws) |
| ` ```tableau ` `{ view, highlight? }` | **replaces `chart`** | tableau block rendered by `ui/Tableau` | view ∈ `player, banker, full` (D34); each highlight is a valid simulator `TableauCellId` (`b4/p7`, `b6/s`, `p5`) present in `TABLEAU` |
| ` ```roads ` `{ results, view?, caption? }` | **yes** | roads block rendered by `ui/Scoreboard` (static) | results string parses with engine `parseRoadString` (`engine/roads.ts`, D34); view ⊆ `bead, big` |

Inline cards render in quiz text, options and explanations, and in scene step
text (holdumb D35). Unknown fences that look like directives (` ```math `,
` ```chart `) and unknown `:::` containers are build errors.

### 3.3 Pipeline (holdumb's, unchanged)

`build/vite-plugin-content.ts` exposes `virtual:content`, built by
`buildContent(root)` in `src/content/load.ts` using the pure `compileLesson()`
in `src/content/compile.ts`; the same functions run in tests; HMR invalidates
on `content/**`. The shipped bundle contains HTML strings and validated JSON,
never `marked` or `yaml`. A missing real JSON file falls back to its
`_sample-*` placeholder; sample lessons are bundled only while `chapters.json`
is absent.

`ContentBundle` (`src/content/types.ts`, stubbed complete in WP0):
`{ chapters, lessons, glossary, bets, systems }`; `Block` =
`html | math | tip | scene | quiz | tableau | roads`.

### 3.4 Content tests (Vitest, node project)

- `tests/content/compile.test.ts` (app): every construct above, good and bad inputs.
- `tests/content/content.test.ts` (app): chapters ↔ lessons both ways;
  `bets.json` covers exactly the engine's bet ids (all variants);
  `systems.json` covers exactly the strategy registry's system ids; every
  `lessonId` / `see` resolves.
- `tests/content/lessons-{a,b,c}.test.ts` (one per content WP): files exist,
  front matter, balanced containers, banned stale wording per decisions.md,
  and **every number the prose quotes** recomputed with math (e.g. Banker
  edge, Tie edge, per-hour costs at `handsPerHour`).
- `src/sim/scene/lessons.test.ts` (integration): **scripts every scene in every
  lesson to completion**.

`docs/authoring.md` (app WP) documents all of this.

---

## 4. EV and job transport

**Decided (D18): no Web Worker.** Baccarat has no
player decisions; the EV sheet is per **bet**, and the exact EV of every bet
over a shoe composition is an enumeration of at most 6 cards over 10 value
classes (plus suits/ranks for pairs and Dragon Bonus margins): thousands of
weighted terms, well under 10 ms on a phone. So the default is **Plan A: no
worker**. The design keeps holdumb's client API for the one thing that is
long (multi-hand simulation), so going back to a worker (Plan B) changes no
caller.

### 4.1 Rules (Plan A)

1. Math stays pure and synchronous in `src/sim/math` (and simulation in
   `src/sim/strategy`). No `postMessage`, no `self`, no async.
2. **Previews are direct synchronous calls.** The default sheet is full-shoe
   EV (D6), a constant per rule set that math may memoise; the Shoe tracker
   recomputes exactly for the remaining composition after every hand. `src/sim/ui` imports the
   `previewSlip(req)` (simulator.md §3, D33)
   from math and renders the EV sheet in the same frame. No skeleton, no
   cache, no cancellation. Perf budget §4.5 guards this.
3. **Long jobs** (auto-play, systems compare, many sessions) are generator
   functions that `yield` progress every few thousand hands
   (`Job<Req, Res>` from `src/sim/engine/job.ts`, verbatim from holdumb) and
   run through the job client, which time-slices them on the main thread.
4. Payloads are plain data (bigint fractions as `{ num, den }`, money in
   cents), as in holdumb, so Plan B stays possible.

### 4.2 Modules (`src/sim/jobs/`, owned by the strategy WP; stubs in WP0)

holdumb's `src/sim/worker/` minus the worker. The directory is renamed so its
name doesn't lie.

| File | From holdumb | Role |
| --- | --- | --- |
| `protocol.ts` | adapt `worker/protocol.ts` | **Frozen contract.** `EvJobs` with **one** kind, `simulate` (single session, many `sessions`, and `compare` on one seed; D18, D33), `JobKind`, re-exported `Progress`, the `EvClient` interface with `mode: 'inthread'` (type kept as `'worker' \| 'inthread'`). **Drop** `ToWorker`, `FromWorker`, `PROTOCOL_VERSION` |
| `jobs.ts` | verbatim shape | `JOBS` map kind → job |
| `runner.ts` + `runner.test.ts` | **verbatim** | `runSliced(job, req, { sliceMs, onProgress, isCancelled, yieldFn })`, `CancelledError` |
| `client.ts` + `client.test.ts` | adapt | `createEvClient()`: in-thread only, `sliceMs: 8`, `MessageChannel` yield, latest-wins per `key`, abort via `AbortSignal`. **Drop** the ping/pong health check, fallback switch, LRU cache and `canonicalJson` (simulations are seeded and not repeated) |
| `index.ts` | verbatim | re-exports |

App side: `src/app/evClient.ts` verbatim (one client per page).

**Deleted from holdumb (Plan A):** `worker/ev.worker.ts`, `host.ts`,
`transport.ts`, `transport-url.ts`, `transport-inline.ts`,
`transport-inthread.ts` (folded into `client.ts`), `transport-worker.ts`,
`protocol.test.ts` (structuredClone round-trip); the `#ev-worker` alias in
`vite.config.ts`, `vitest.config.ts` and `tsconfig.app.json` `paths`;
`worker: { format }` in `vite.config.ts`; ESLint's `WORKER_GLOBALS` block and
the `'\\#ev-worker'` bare-import ban; `window.__holdumb.client/smoke/inthread`
in `env.d.ts` and `test-hook.ts`; `tests/e2e/single-file.spec.ts`'s "hosted
build uses a real worker" test and the `mode === 'worker'` assertion;
`tests/e2e/offline.spec.ts`'s "precache includes the EV worker file" test;
the worker half of `perf.spec.ts`; the WP0 `worker-smoke` spec;
`src/sim/math/tables/` and its ignores.

### 4.3 Layering

`jobs` replaces `worker` in ESLint's `SIM_LAYERS` with the same allowed set
(`engine, math, strategy`) but is now **pure** (it joins the
`PURE_GLOBALS` block: no `self`, `postMessage`, `document`, `window`). `ui` may
import only `jobs/index`, `jobs/client`, `jobs/protocol`.

```
engine    ← nothing
math      ← engine
strategy  ← engine, math
jobs      ← engine, math, strategy
scene     ← engine, math, strategy
ui        ← engine, math, strategy, scene, jobs (index/client/protocol only)
content   ← sim sub-barrels (types, parseCards, handTotal, validateScene, registries)
app       ← everything
pwa       ← nothing app specific
```

If simulator.md adds a pure layer (say `src/sim/roads`), it goes into
`SIM_LAYERS` / `ALLOWED` in WP0 and into the layering test; default is that
road derivation lives in the engine (`engine/roads.ts`), rendering in `ui`.

### 4.4 Plan B (only if simulator.md or a perf test says a worker is needed)

Restore from holdumb, unchanged except paths (`worker` → `jobs`):
`ev.worker.ts`, `host.ts`, the four transports, `ToWorker/FromWorker`, the
client health check and fallback, the `#ev-worker` alias in three configs,
`worker.format: single ? 'iife' : 'es'` (required: an inline module worker
fails under `file://`, verified in holdumb's spike), the ESLint worker block,
and holdumb's worker e2e tests. Previews would then go through
`client.run('preview', …)`; `ui` already handles async results for
`simulate`, so only the EV sheet's call site changes. Budget the single file
at target 550 kB / fail 750 kB in that case.

### 4.5 Performance budget (`perf.spec.ts`, mobile project, 4× CPU throttle)

| Operation | Budget at 4× throttle |
| --- | --- |
| Full EV sheet, Shoe tracker on (every bet, exact over the remaining shoe) | < 30 ms, no long task > 50 ms |
| Deal → settle (instant speed, logic only) | < 16 ms |
| `simulate` 1,000 hands, one system | < 1 s, with progress |
| `simulate` with `sessions: 100` × 720 hands | < 3 s, progress, no long task > 50 ms |
| First paint of `#/play` from cold single file | < 1.5 s |

Numbers are placeholders; simulator.md may tighten them in decisions.md.

---

## 5. Delivery

### 5.1 GitHub Pages (home)

`https://creynia.github.io/baccaratton/`, built by `pages.yml` (§7.2).
`base: './'` and hash routing, so the same build works under `/baccaratton/`,
`file://` and `content://`. The repo is public and `main` is on origin (D1);
Pages with Source = GitHub Actions is **already enabled** (D12), so WP0
ships `pages.yml` and the very first merge to `main` deploys.

### 5.2 PWA

- `public/manifest.webmanifest`: `name: "baccaratton: learn Baccarat"`,
  `short_name: "baccaratton"`, `start_url: "./"`, `scope: "./"`,
  `display: "standalone"`, `orientation: "any"`, `background_color` and
  `theme_color` **`#5c1a2b`**, icons 192, 512, maskable 512, SVG.
- Icon: `assets/icon.svg` = burgundy tile, gold ring, two overlapping cards: a
  back card and a front card showing a large **"9"** (a natural) with a
  diamond pip. `scripts/gen-icons.mjs` adapted to draw the same procedurally
  (the zero-dep PNG writer is verbatim; only the drawing function and colours
  change; a "9" is drawn as a ring plus a stroked tail). Outputs gitignored;
  `tests/build/icons.test.ts` checks PNG signatures and sizes.
- SW: holdumb's `src/pwa/sw.ts` with `PREFIX = 'baccaratton-'` (includes the
  `cache: 'reload'` precache fix). Precache everything, cache first,
  navigation fallback to `index.html`, versioned cache, old caches deleted on
  activate, no automatic `skipWaiting`.
- Update: "Update available — Reload" toast (`SKIP_WAITING`, reload on
  `controllerchange`), Settings → Check for updates, build sha in About.
- Registration only when `!__SINGLE_FILE__`, not in dev, only on `http(s):`.

### 5.3 Single offline file `baccaratton.html`

- `npm run build:single` → `vite build --mode single` (singlefile plugin, no
  `public/`, no SW plugin) → `scripts/finalize-single.mjs` renames to
  `dist-single/baccaratton.html` and fails on any external reference, on SW
  registration and on the size budget (holdumb's checks, unchanged).
- `build:all` copies it to `dist/baccaratton.html`; Home and More link to the
  release asset ("Download offline copy") when not in single mode.
- Opens in Chrome from Downloads (choose **Chrome**, not "HTML Viewer").
  Storage may be unavailable under `file://` / `content://`: the in-memory
  banner and Export/Import cover it.

### 5.4 Size budget

Measured today: holdumb's single file is **423,095 B raw / 136,399 B gzip**,
of which ~47 kB is the duplicated worker copy of engine + math and ~11 kB the
preflop table; content is the next biggest part. baccaratton has neither the
worker copy nor tables, a smaller engine (no 7-card evaluator) and adds the
roads and tableau UI.

| | Budget (raw bytes) |
| --- | --- |
| Expected | ~330–400 kB |
| Target (`TARGET_SINGLE_BYTES`, warning) | 450,000 |
| Hard fail (`MAX_SINGLE_BYTES`) | 600,000 |

`tests/build/single-file.test.ts` asserts the budget on a real build when one
exists and prints the size so reviewers see the trend.

### 5.5 Rolling release

`release.yml` keeps a `latest-build` prerelease with `baccaratton.html`,
updated on every push to `main` (force-moved tag, `gh release upload
--clobber` + edit, else create `--prerelease`), and makes a versioned release
on `v*` tags. holdumb's file, renamed. The stable download URL is
`https://github.com/creynia/baccaratton/releases/download/latest-build/baccaratton.html`
(used by `OfflineLink`).

### 5.6 Claude Artifact preview

The orchestrator can publish `dist-single/baccaratton.html` as an Artifact for
the first look as soon as the table deals (D12), then Pages. It has no external requests, `<title>baccaratton</title>`,
a body background and tokens on `:root` with the dark guard. With Plan A there
is no worker to be blocked by the host's CSP.

---

## 6. Repo layout and file ownership

Tags name the owning work package (§9). **[B]** = baton file (shared, owned by
the orchestrator, edited only under a grant). Simulator.md's chunk list wins
on the split inside `src/sim/**`.

```
baccaratton/
├── .github/
│   ├── workflows/{ci,pages}.yml                    [WP0 → infra]
│   ├── workflows/release.yml                       [infra]
│   ├── ISSUE_TEMPLATE/{bug_report,lesson_idea}.md  [infra]
│   └── pull_request_template.md                    [infra]
├── assets/icon.svg                                 [infra]
├── build/
│   ├── vite-plugin-content.ts                      [app]
│   └── vite-plugin-sw.ts                           [infra]
├── content/
│   ├── chapters.json glossary.json bets.json systems.json   [content-a lead] [B]
│   ├── lessons/NN-slug.md                          [content-a 01–08 | content-b 09–16 | content-c 17–24] (D24)
│   └── README.md                                   [app]
├── docs/
│   ├── design/{curriculum,simulator,architecture}.md  [spikes; frozen after PR #1]
│   ├── design/decisions.md                         [orchestrator] [B]
│   ├── authoring.md                                [app]
│   ├── chips.md                                    [orchestrator] [B]
│   └── screenshots/                                [table-ui, integration]
├── public/manifest.webmanifest, public/icon.svg    [infra]   (public/icons/ generated, gitignored)
├── scripts/{gen-icons,finalize-single}.mjs         [infra]
├── src/
│   ├── main.tsx                                    [WP0 → app] [B]
│   ├── env.d.ts                                    [WP0] [B]   __SINGLE_FILE__, __APP_VERSION__, __BUILD_SHA__, virtual:content, window.__baccaratton test hook
│   ├── sim/
│   │   ├── index.ts                                [WP0] [B]   public barrel (append-only)
│   │   ├── engine/                                 [engine]    types.ts FROZEN [B]; cards/parseCards, values & totals, shoe (8 decks, cut card, burn), seeded rng, forced shoes, drawing rules (playerDraws/bankerDraws), bet registry & payouts per variant, settle, roads.ts (roads data + `parseRoadString`), log, money, job.ts [B] (verbatim from holdumb, frozen, D37)
│   │   ├── math/                                   [math]      types.ts FROZEN [B]; fraction, exact outcome distribution per composition, previewSlip, edges per bet/variant, tiers, alternatives, explain rows, Monte-Carlo cross-checks
│   │   ├── strategy/                               [strategy]  types.ts FROZEN [B]; betting systems (flat, Martingale, Paroli, 1-3-2-6, Fibonacci, D'Alembert, follow-the-shoe, side-bet sprinkler…), the `simulate` job (with `sessions`), per-hour metrics, drill.ts (spot generator + grading)
│   │   ├── jobs/                                   [strategy]  protocol.ts FROZEN [B]; runner, client, jobs
│   │   ├── scene/                                  [integration] types.ts FROZEN [B]; runner, validate (WP0 stub), lessons.test.ts
│   │   └── ui/                                     [table-ui]  types.ts [B] (SimSettings, WP0); Felt, Card, HandView, BetSpot, ChipRack, ChipStack, EvSheet, TierBadge, Tableau, Scoreboard (bead + big road), ShoeTracker, ShoeMeter, SessionPanel (D35), settlement toast with tappable commission line (D35), animation, layouts/, gallery; [strategy] AutoPlayPanel, BankrollChart, SurvivalChart, OutcomeHistogram; [integration] Simulator.tsx, StepPanel, persist, settings
│   ├── content/{types,compile,load,cards}.ts       [app]   types.ts [B] (complete in WP0)
│   ├── app/                                        [app]
│   │   ├── App.tsx routes.tsx router.ts context.tsx store.ts storage.ts settings.ts theme.ts update.ts evClient.ts bets.ts test-hook.ts
│   │   ├── screens/ Home Learn Lesson Play Drill Rules Bets Roads Glossary Settings About More NotFound
│   │   ├── components/ Shell Link Html Quiz LessonScene Cards TableauBlock RoadsBlock TierBadge ProgressRing OfflineLink
│   │   └── styles/ tokens.css [B] app.css
│   └── pwa/{sw,register}.ts, UpdateToast.tsx       [infra]
├── tests/
│   ├── app/          [app]
│   ├── content/      compile.test.ts, content.test.ts [app]; lessons-{a,b,c}.test.ts [content-*]
│   ├── build/        icons, sw, single-file, layering .test.ts [infra]
│   ├── fixtures/content/_sample-*.json             [app]
│   └── e2e/          smoke.spec.ts [WP0 → integration]; offline, single-file [infra]; the rest [integration]
├── index.html                                      [WP0] [B]
├── vite.config.ts, vitest.config.ts, playwright.config.ts  [WP0] [B]
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json    [WP0] [B]
├── eslint.config.js                                [WP0] [B]
├── .prettierrc.json .prettierignore .editorconfig .gitignore .nvmrc  [WP0] [B]
├── package.json, package-lock.json                 [WP0] [B]
├── LICENSE (exists)                                [orchestrator]
└── README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md  [infra]
```

Simulator unit tests are colocated (`src/sim/**/*.test.ts(x)`); everything
else under `tests/**`.

E2E specs (`tests/e2e/`, integration unless noted): `smoke` (WP0), `tabs`
(every tab and screen at 390×844, 844×390, 360×740 with axe), `lessons`
(quiz + scene to completion + reload persists), `sandbox` (place Banker, EV
sheet shows the edge before Deal, Tie needs a second tap with
`confirmCostlyBets`, deal settles with the right commission in cents, roads
update, Shoe tracker toggle shows current-shoe EV, auto-play compares systems on one seed, reload restores the shoe mid-way), `drill` (answer a
Player and a Banker spot, tableau cell highlighted, streak persists, "See the
chart" deep-links), `settings` (variant switch changes the bet spots and
Banker payout, export → reset → import), `layout` (360 px no horizontal
scroll, Deal visible at 844×390), `a11y` / `axe` (home, lesson, play, drill,
rules, bets, roads), `offline` [infra] (SW offline reload, EV sheet offline),
`single-file` [infra] (open via `file://`, deal a hand, EV sheet renders, no
failed requests or console errors), `perf` (mobile only, §4.5),
`screenshots` (integration and table-ui).

---

## 7. Scripts and workflows

### 7.1 `package.json` scripts (holdumb's, renamed)

```json
{
  "predev": "node scripts/gen-icons.mjs",
  "dev": "vite",
  "prebuild": "node scripts/gen-icons.mjs",
  "build": "tsc -b && vite build",
  "build:single": "vite build --mode single && node scripts/finalize-single.mjs",
  "build:all": "npm run build && npm run build:single && cp dist-single/baccaratton.html dist/baccaratton.html",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "gen:tables": "GEN_TABLES=1 vitest run --project node --passWithNoTests tests/gen",
  "lint": "eslint .",
  "typecheck": "tsc -b --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "check": "npm run lint && npm run typecheck && npm run format:check && npm test"
}
```

`gen:tables` stays as a no-op so nobody needs `package.json` to add a table.

**`vite.config.ts` (Plan A)** is holdumb's minus the alias and `worker` keys:

```ts
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    define: {
      __SINGLE_FILE__: JSON.stringify(single),
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
    },
    plugins: [preact(), contentPlugin(), ...(single ? [viteSingleFile()] : [swPlugin()])],
    publicDir: single ? false : 'public',
    build: { outDir: single ? 'dist-single' : 'dist', target: 'es2022' },
  };
});
```

`vitest.config.ts`: holdumb's minus `resolve.alias` (two projects, the same
`domGlobs`). `tsconfig.app.json`: holdumb's minus `paths`. `tsconfig.node.json`:
holdumb's `include` plus `src/sim/jobs/**/*.ts`. `.prettierignore`: holdumb's
minus `src/sim/math/tables`, with `src/sim/worker/protocol.ts` →
`src/sim/jobs/protocol.ts` (frozen type files stay byte-identical to the design
doc).

Playwright: holdumb's config verbatim (`PORT` env, default 4173,
`reuseExistingServer: !process.env.CI`, projects `mobile` 390×844,
`phone-landscape` 844×390 for `sandbox|lessons|layout|drill|tabs|screenshots`,
`desktop`; `perf.spec.ts` mobile only). Locally:
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, install with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`. Parallel agents and reviewers
each use their own `PORT`.

### 7.2 Workflows (holdumb's, renamed)

- **`ci.yml`**: push to `main` + `pull_request`; concurrency per ref, cancel
  in progress; `contents: read`; 20 min. Job `check`: checkout, setup-node
  (`.nvmrc`, npm cache), `npm ci`, lint, typecheck, format:check,
  `build:all`, `npm test` (after the build, so single-file and SW tests see
  real output), upload artifact `baccaratton-html`. Job `e2e` (needs
  `check`): `npm ci`, `npx playwright install --with-deps chromium`,
  `npm run test:e2e`, upload `playwright-report` on failure.
- **`pages.yml`**: push to `main` + `workflow_dispatch`; `contents: read,
  pages: write, id-token: write`; concurrency `pages`, no cancel. Build:
  `npm ci`, `npm run check`, `npm run build:all`, `configure-pages@v5`,
  `upload-pages-artifact@v3` (`dist`); deploy `deploy-pages@v4`,
  environment `github-pages`. Known flake: "updating_pages" timeout then
  "deployment in progress": re-run the failed job (CONTRIBUTING).
- **`release.yml`**: tags `v*` + `main` + `workflow_dispatch`; `contents:
  write`; `npm ci`, `npm run build:single`, versioned release step, rolling
  `latest-build` step; notes line "Download baccaratton.html and open it in
  Chrome; it works offline."

---

## 8. WP0: scaffold and contracts (serial, one agent)

WP0 creates every [WP0] and [B] file, so no later WP needs `package.json`, a
tsconfig, the ESLint config or the Vite config. Worktree
`/home/user/wt-wp0`, branch `claude/baccaratton-wp0` from `main`.

1. **Tooling (copy holdumb, then adapt per §1.2 / §7.1):** dependency block
   verbatim, `npm install` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, all
   scripts, Vite/Vitest/Playwright/tsconfigs (no worker alias), ESLint with
   `jobs` in place of `worker` and in the pure-globals block, `.nvmrc`,
   `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `index.html`
   (title `baccaratton`, `theme-color #5c1a2b`, inline SVG favicon of the
   icon, description "Learn Baccarat: lessons, odds, and a practice table
   that shows the EV of every bet."), `src/env.d.ts`, and
   **`.github/workflows/ci.yml` + `pages.yml`** copied from holdumb (renamed;
   the artifact name `baccaratton-html`), so the WP0 merge itself deploys a
   placeholder site (D12). `release.yml` stays with infra.
2. **Contract stubs** (real types; throwing bodies `throw new Error('TODO(<wp>)')`):
   - `src/sim/engine/types.ts`, `math/types.ts`, `strategy/types.ts`,
     `scene/types.ts` and `jobs/protocol.ts` copied **verbatim** from
     simulator.md (imports fixed so they lint), then frozen.
   - Each `src/sim/<module>/index.ts` with simulator.md's signatures, plus
     real small data the content tests need: bet ids per variant, rule preset
     ids, variant ids (`punto-banco`, `ez`, `super-6`), `TiePays`, strategy ids
     (D13), Drill modes and the 14 category ids (D29).
   - `src/sim/engine/job.ts` **verbatim** from holdumb (`jobs/protocol.ts`
     imports it; frozen, prettier-ignored) and `src/sim/ui/types.ts` with
     `SimSettings` (D13 fields, D37); app `Settings` extends it.
   - Implemented for real (small, needed by content and URLs): `parseCards`
     (the one name; not `parseCard(s)`), `cardValue`, `handTotal`,
     `playerDraws`, `bankerDraws`, the literal **`TABLEAU`**, **`betsOffered`**
     (per variant id) and **`parseRoadString`** (D37) (the drawing rules
     are ~25 lines and the tableau, Drill and quiz validation all need them),
     each with an exhaustive test (all 10×10 two-card totals; the full Banker
     tableau against a literal table from curriculum.md).
   - `src/sim/jobs/{runner,client}.ts` working over a stub job (runner
     verbatim from holdumb).
   - `src/sim/scene/validate.ts`: minimal `validateScene` (shape only).
   - `src/sim/ui/Simulator.tsx`: placeholder (heading + "table coming soon"
     card); `EvSheet`, `Tableau`, `Scoreboard` placeholders with their final
     props.
   - `src/sim/index.ts` barrel.
   - `src/content/types.ts` complete (blocks incl. `tableau`, `roads`, quiz
     `hand: {player: Card[], banker: Card[]}`, `ContentBundle` with `systems`).
   - `src/main.tsx` + a minimal `App` shell with a visible `h1` and the four
     tabs; `src/app/styles/tokens.css` with the burgundy tokens (§10).
   - `tests/fixtures/content/_sample-*.json` and one `_sample-welcome.md`.
3. **Tests:** one Vitest test per project (node: `parseCards` + drawing
   rules; dom: placeholder renders), `runner.test.ts`, `layering.test.ts`
   (from holdumb, layers updated), `tests/e2e/smoke.spec.ts` (visible `h1`,
   title `baccaratton`, no horizontal scroll; structure, not placeholder
   text), and `tests/e2e/single-file.spec.ts` (open `dist-single/baccaratton.html`
   via `file://`, no failed requests, no console errors).
4. **Docs:** README "under construction" line only.

**Exit:** on a clean clone `npm ci && npm run check && npm run build:all &&
npm run test:e2e` are green (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`),
`dist-single/baccaratton.html` exists with no external references and is
under budget, and an **Opus review of WP0** confirms: every dependency
present; test files typecheck with Node types; a deliberate bad relative
import fails lint in each layer; CI and the Pages deploy are green on the
WP0 PR / merge; no leftover `holdumb`, `#ev-worker`,
`__holdumb`, `0b2e4a` string (`git grep -n` is empty); the baton list matches
the files. Only then fan out.

---

## 9. Parallel work packages

All branch from merged WP0 (`claude/baccaratton-<wp>`, worktree
`/home/user/wt-<wp>`). Simulator.md's chunk list wins on the internal split of
`src/sim/**`; this is the default mapping.

| WP | Owns | Depends on | Delivers |
| --- | --- | --- | --- |
| **engine** | `src/sim/engine/**` | WP0 | cards, values, seeded shoe (8 decks default, cut card, burn per simulator.md), forced shoes, drawing rules, bet registry with payouts for `punto-banco` / `ez` / `super-6` and `tiePays` 8 / 9 incl. Pairs, Dragon 7, Panda 8, Dragon Bonus, settlement in integer cents (commission rounding per decisions.md), roads data (bead, big road), event log, replay. Exhaustive oracle tests (every 4–6-card deal class). **Pushes early** |
| **math** | `src/sim/math/**` | engine (merge early) | exact rational outcome distribution for any shoe composition, previews for every bet, house edge per bet and variant (per resolved bet and per hand), tiers, better-alternative copy keys, "Why?" rows (e.g. "Banker wins 45.86%, Tie 9.52%"), Monte-Carlo cross-checks, perf test |
| **strategy** | `src/sim/strategy/**`, `src/sim/jobs/**`, `ui/{AutoPlayPanel,BankrollChart,OutcomeHistogram}` | engine, math | betting systems (flat lowest-edge, practical, fun-per-dollar lenses), pattern-chasing systems that read the roads (honestly costing the same), the `simulate` job (one kind; `sessions` and `compare`), per-hour metrics at `handsPerHour`, `drill.ts` (seeded spot generator per mode, grading, spot codes), compare mode on one seed |
| **table-ui** | `src/sim/ui/**` except strategy's and integration's files | engine and math types | `SessionPanel` (curriculum §8.4 fields; l14, l18) and the settlement toast's tappable commission line (tap target `commission`; l07-s1, l23-s1) per D35, felt SVG portrait + landscape, cards (SVG, text-presentation suits, 4-colour), animated draw sequence with reduced-motion, chips and bet spots per variant, EvSheet, TierBadge, **Tableau**, **Scoreboard** (bead plate + big road), ShoeMeter, a gallery driven by the **real** engine, screenshots |
| **app** | `src/app/**`, `src/content/**`, `build/vite-plugin-content.ts`, `content/README.md`, `tests/app/**`, `tests/content/{compile,content}.test.ts`, `tests/fixtures/**`, `docs/authoring.md` | WP0 | all screens and routes (§2), store/storage, settings, content compiler incl. `{{cards}}` totals, `tableau`, `roads`, quiz `hand`; uses the placeholder Simulator until integration |
| **infra** | `src/pwa/**`, `build/vite-plugin-sw.ts`, `scripts/**`, `public/**`, `assets/**`, `.github/**`, `tests/build/**`, `tests/e2e/{offline,single-file}.spec.ts`, README, CONTRIBUTING, CODE_OF_CONDUCT | WP0 | SW + update flow + check-for-updates, manifest, burgundy icons, finalize-single with budget, workflows, layering lint test, repo docs (README "Use it" first, disclaimer, help lines) |
| **content-a** (lead) | `content/{chapters,glossary,bets,systems}.json`, lessons **1–8**, `lessons-a.test.ts` | app format, engine ids | per curriculum.md §4 (D24) |
| **content-b** | lessons **9–16**, `lessons-b.test.ts` | content-a JSON ids | D24 |
| **content-c** | lessons **17–24**, `lessons-c.test.ts` | strategy ids | D24 |
| **integration** (after engine, math, table-ui, strategy, app) | `src/sim/scene/**`, `ui/{Simulator,StepPanel,persist,settings}`, `tests/e2e/**` except infra's | all | scene runner with strict validation, Simulator container wiring engine + math + jobs + UI + scenes, persistence (shoe mid-way), **a test that scripts every scene to completion**, e2e on three projects + axe + perf, screenshots it views itself |

Lesson ranges are fixed by D24 (24 lessons, 7 chapters, ids in curriculum.md
§4). Inside `src/sim/**` simulator.md §8 wins on ownership (D24); D35 gives
table-ui `SessionPanel.tsx` and the commission line.

Merge order: engine → math → strategy / table-ui → app → infra (any time) →
integration → content (content PRs merge as soon as their tests pass against
the real registries).

### 9.1 Baton list (shared files; orchestrator owns; `BATON REQUEST <path> <why>`)

| Path | Typical requester | Note |
| --- | --- | --- |
| `package.json`, `package-lock.json` | anyone | WP0 should make this unnecessary; orchestrator adds deps serially |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | infra, strategy | |
| `eslint.config.js` | infra | layering blocks |
| `vite.config.ts` | app, infra | one line per plugin |
| `vitest.config.ts`, `playwright.config.ts` | integration | projects, `testMatch` |
| `index.html` | infra | meta tags |
| `src/main.tsx` | app (owner after WP0), infra | infra asks app; never edited directly |
| `src/env.d.ts` | infra, integration | new globals, test hook |
| `src/sim/index.ts` | engine, math, strategy, table-ui | append exports only |
| `src/sim/engine/types.ts`, `math/types.ts`, `strategy/types.ts`, `scene/types.ts` | owners | **frozen**: contract change via main, relayed to dependants |
| `src/sim/engine/job.ts` | strategy, math | **frozen**, verbatim from holdumb, prettier-ignored (D37) |
| `src/sim/ui/types.ts` | table-ui, integration, app | `SimSettings`; app `Settings` extends it (D37) |
| `.prettierignore`, `.prettierrc.json`, `.editorconfig`, `.gitignore`, `.nvmrc` | any | the frozen-file list lives in `.prettierignore` (D37) |
| `src/sim/jobs/protocol.ts` | strategy, math | **frozen**: new job kinds via main |
| `src/content/types.ts` | app, content | |
| `src/app/styles/tokens.css` | table-ui, app | felt, card, tier, chip, road colours |
| `content/{chapters,glossary,bets,systems}.json` | content-b, content-c | content-a owns; others request |
| `docs/design/decisions.md`, `docs/chips.md` | anyone | orchestrator writes |
| `README.md` | infra owns; content may request | the "Use it" section |

---

## 10. Theme

Burgundy felt with gold trim (D10). Light page background stays warm
paper so lessons read well; the felt is the same in both themes.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#f7f3ef` | `#17100f` |
| `--surface` | `#ffffff` | `#231918` |
| `--text` | `#2a1a1d` | `#f1e8e6` |
| `--muted` | `#6b5a5d` | `#b3a2a4` |
| `--accent` | `#7a2236` | `#e59aac` |
| `--felt` / `theme_color` | `#5c1a2b` | `#5c1a2b` |
| `--felt-line` (bet spot outlines, trim) | `#d4af37` | `#d4af37` |
| `--player` / `--banker` / `--tie` (road and spot marks) | `#1f5fbf` / `#c0262d` / `#1a7f4b` | `#6da8ff` / `#ff7b72` / `#4cc38a` |

Player is blue and Banker red, matching casino scoreboards, and every road
mark also carries a letter or shape (never colour alone). Tier tokens, suit
tokens and chip tokens are holdumb's (tier names per decisions.md). table-ui
may refine values under the baton; contrast is checked by axe.

---

## 11. Every holdumb file: verbatim, adapt, replace or delete

"Verbatim" = copy, then only `holdumb` → `baccaratton` string renames (WP0's
`git grep` check). Files inside `src/sim/**` are **candidates**: simulator.md
decides; the listed owner copies them.

**Verbatim**

| File(s) | Owner |
| --- | --- |
| `.editorconfig`, `.nvmrc`, `.prettierrc.json`, `.gitignore` (identical to the repo's) | WP0 |
| `tsconfig.json` | WP0 |
| `playwright.config.ts` | WP0 |
| `CODE_OF_CONDUCT.md` | infra |
| `.github/workflows/{ci,pages,release}.yml`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md` | infra (rename only) |
| `build/vite-plugin-content.ts`, `build/vite-plugin-sw.ts` | app / infra (plugin names) |
| `src/main.tsx` | WP0 |
| `src/pwa/{sw,register}.ts`, `src/pwa/UpdateToast.tsx` | infra (cache prefix) |
| `src/app/{router,context,theme,update,evClient,settings}.ts(x)` | app (`evClient` import path `../sim`) |
| `src/app/App.tsx` | app (scroll key) |
| `src/app/components/{Html,Link,ProgressRing,TierBadge,LessonScene,OfflineLink}.tsx` | app (offline URL) |
| `src/app/screens/{Glossary,Lesson,NotFound,About}.tsx` | app |
| `src/app/styles/app.css` | app |
| `tests/app/{router,storage,store}.test.ts` | app (storage/store tests adapt to drill modes) |
| `tests/build/{icons,sw}.test.ts` | infra |
| `tests/e2e/{smoke,axe,a11y}.spec.ts` | WP0 / integration (screen list) |
| `scripts/gen-icons.mjs` PNG writer (CRC, zlib, IHDR) | infra |
| sim candidates: `engine/{rng,money,log,job}.ts`, `math/fraction.ts` (+tests), `jobs/runner.ts` (+test), `ui/{animation,ChipStack,ChipRack,Toasts,TierBadge,StatusBar,BankrollChart,OutcomeHistogram,AutoPlayPanel}.tsx`, `ui/{text,status,altCopy}.ts` | per simulator.md |

**Adapt**

| File | Change |
| --- | --- |
| `package.json` | name, `build:all` file name; deps verbatim |
| `vite.config.ts`, `vitest.config.ts`, `tsconfig.app.json` | drop `#ev-worker` alias, `worker`, `paths` |
| `tsconfig.node.json` | include `src/sim/jobs/**` |
| `eslint.config.js` | `worker` → `jobs`, jobs pure, drop `#ev-worker` bans and `src/sim/math/tables/**` ignore |
| `.prettierignore` | frozen file list (`jobs/protocol.ts`), drop tables |
| `index.html`, `public/manifest.webmanifest`, `assets/icon.svg`, `public/icon.svg` | burgundy, names, the "9" card icon |
| `scripts/gen-icons.mjs` | drawing function and colours |
| `scripts/finalize-single.mjs` | file name, budget 450 kB / 600 kB |
| `src/env.d.ts` | drop worker test-hook types; `window.__baccaratton` test hook (store, seeded deal) |
| `src/app/test-hook.ts` | expose `{ store, version }` and a `deal(seed)` smoke for e2e; no worker |
| `src/app/storage.ts`, `store.ts` | key `baccaratton:v1`, drill `byCategory` (D29), settings validation for the new fields |
| `src/app/routes.tsx` | §2.1 routes |
| `src/app/components/Shell.tsx` | brand, tab icons (♠ Learn, ◆ Play, ◎ Drill, ≡ More with text-presentation selector), More match list |
| `src/app/components/{Cards,Quiz}.tsx` | baccarat totals badge; quiz `hand: {player: Card[], banker: Card[]}` |
| `src/app/screens/{Home,Learn,More,Play,Settings}.tsx` | §2 contents; Settings sections Table (variant, tiePays, unit, bankroll, hands/hour), Practice (practice, confirmCostlyBets, shoeTracker, showRoads), Display, Progress, Updates |
| `src/app/screens/Bets.tsx`, `src/app/bets.ts` | bet ids, variants, edges from math (no hard-coded fraction table) |
| `src/content/{types,compile,load,cards}.ts` | §3 blocks, `systems.json`, drop `hands`/`strategy`/`isHandClass` |
| `src/app/styles/tokens.css` | §10 |
| `tests/content/{compile,content}.test.ts` | new blocks and registries |
| `tests/build/{single-file,layering}.test.ts` | name and budget; layer list |
| `tests/e2e/{offline,single-file,tabs,perf}.spec.ts` | drop worker tests; new screens; §4.5 budgets |
| `tests/fixtures/content/_sample-*.json` | `systems` replaces `hands`; baccarat sample bets |
| `README.md`, `CONTRIBUTING.md`, `content/README.md`, `docs/authoring.md` | baccarat wording, `{{cards}}`, `tableau`, `roads` |

**Replace (new file, holdumb one is a pattern only)**

| holdumb | baccaratton |
| --- | --- |
| `src/app/screens/Drill.tsx` | third-card trainer (same layout skeleton: prompt, answer buttons, verdict, tableau, links, streak) |
| `src/app/screens/Strategy.tsx` | `Rules.tsx` (drawing-rules tableau) |
| `src/app/screens/Hands.tsx` | `Roads.tsx` (roads explainer) |
| `src/app/components/ChartBlock.tsx` | `TableauBlock.tsx`, `RoadsBlock.tsx` |
| `content/hands.json`, `content/strategy.json` | `content/systems.json` |
| `tests/e2e/{drill,sandbox,lessons,screenshots}.spec.ts` | baccarat flows (§6) |
| engine evaluator, paytables, wagers, game; math enumerate/showdown/preflop; strategy chart/ranks/river/d36; ui Felt/Table/FoldReveal/StrategyChart/EvOptionList/WhyTable/layouts | per simulator.md |

**Delete (not copied)**

`src/sim/worker/{ev.worker,host,transport,transport-url,transport-inline,transport-inthread,transport-worker}.ts`,
`worker/protocol.test.ts`, `src/sim/math/tables/**`, `src/app/screens/handLabels.ts`,
`tests/e2e/worker-smoke.spec.ts` (WP0-only in holdumb), `tests/fixtures/content/_sample-hands.json`,
`docs/screenshots/*` (regenerated), all holdumb lessons and `docs/design/*`.

---

## 12. Viewing it on the phone (README "Use it" section)

**Right away (no setup):** ask the session to publish the single-file build as
an Artifact, then tap the link in the Claude app.

**The web app (once):**
1. Nothing to set up: the repo is public and Pages deploys from GitHub
   Actions on every merge to `main`. Open
   **https://creynia.github.io/baccaratton/** in Chrome. (If a deploy ever
   needs a nudge: **Actions** tab → "Deploy to GitHub Pages" → **Run
   workflow**. For forks: Settings → Pages → Source → GitHub Actions, using
   ⋮ → Desktop site if Settings is hidden.)
2. Chrome ⋮ → **Add to Home screen → Install**. It opens like an app (burgundy
   icon with a "9" card) and works offline after the first load.

**The offline file:**
1. GitHub app → baccaratton → **Releases** → "Latest build" → tap
   **baccaratton.html** (or in the app: More → "Download offline copy").
2. Chrome ⋮ → **Downloads** → tap `baccaratton.html`. If asked, open with
   **Chrome**, not "HTML Viewer" (it doesn't run scripts).
3. Progress in this copy is separate from the website's. Use **Settings →
   Export** and **Import** to move it.

**Updating:** every merge to `main` redeploys Pages and refreshes the "Latest
build" release. The installed app shows **"Update available — Reload"**. If
not, open **Settings → Check for updates** and compare the build code in
**About** with the latest commit; as a last resort close the app from Recents
and reopen it, or Chrome ⋮ → Settings → Site settings → All sites →
creynia.github.io → Delete & reset. If a Pages deploy failed with "deployment
in progress", re-run the failed job in the Actions tab.

**Disclaimer (README and About):** education only, play money only, the house
always has an edge and no system or scoreboard pattern changes it; help line
1-800-GAMBLER (US) or the national problem-gambling helpline.

---

## 13. Questions sent to main (all answered)

1. Felt colour: **burgundy `#5c1a2b` + gold** (D10).
2. Tab bar: **Learn · Play · Drill · More**, Drill = third-card trainer (D11).
3. First view: **Artifact of the single file as soon as the table deals, then
   Pages**; Pages/Actions already enabled, so WP0 ships the deploy (D12).
4. Hands per hour: **72** (D5).

## 14. Assumptions for decisions.md

- Plan A (no worker) unless simulator.md says otherwise; §4.4 is the
  fallback recipe and costs no caller changes.
- Road derivation is engine data (`engine/roads.ts`), rendering is
  `ui/Scoreboard`; derived roads are a static picture plus text only (D4).
- Drill per D29: modes group the 14 categories, progress persisted per
  category, `?cat=` and `?focus=misses`; graded strictly (one right answer).
- Primary metric is edge per bet placed (D14); the per-resolved figure only
  in "Why?", Bets detail and lesson 13/14 prose (D32). Tiers per D19
  (`costly` / `sucker`).
- Scratch evidence: `/tmp/baccaratton-scratch/architecture/wk` (lockfile
  install, versions) and `/tmp/baccaratton-scratch/architecture/holdumb`
  (build, check and e2e baseline, single-file size).
