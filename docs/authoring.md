# Authoring lessons

Lessons are Markdown files in `content/lessons/`, compiled at build time by `src/content/compile.ts`
(`marked` and `yaml` never ship to the phone). Run `npm run dev` to preview with hot reload, and
`npm test` (`tests/content/`) before pushing. **Any invalid scene, quiz, tableau, roads block, card code,
glossary link or container fails the build**, with the file name in the message.

## Files

| Path | Holds |
| --- | --- |
| `content/lessons/NN-slug.md` | One lesson. `NN-` orders the file; the slug must equal the front-matter `id`. |
| `content/chapters.json` | `[{ id, title, summary, lessons: [lessonId] }]`. Every lesson is in exactly one chapter. |
| `content/glossary.json` | `[{ term, slug?, definition (md), see?: [slug], seeAlso?: lessonId }]` |
| `content/bets.json` | `{ [betId]: { summary, howItWorks (md), tip?, name?, lessonId? } }` (every simulated bet id) |
| `content/systems.json` | `{ [systemId]: { title, summary, rules: [md], lessonId? } }` (every betting-system id) |
| `tests/fixtures/content/_sample-*` | Placeholders for a missing file. Leave them alone. |

Never put payouts, edges, probabilities or tableau cells in these files. They come from the engine and math.
Lesson prose may quote numbers; `tests/content/lessons-*.test.ts` recompute each one.

## A lesson

````markdown
---
id: banker-draws
title: When the Banker draws
chapter: rules
summary: The Banker's rule depends on the Player's third card.
minutes: 6
---

The Player has {{4h Ac 9d =}} and the Banker shows {{Kd 5s}}. See [[Natural]].
````

Headings: use any depth; the shallowest is shifted to `h2` (the page title is the `h1`).

## Constructs

| Construct | Syntax | Notes |
| --- | --- | --- |
| Show the math | `:::math Title` ... `:::` | Collapsed by default. Title required. |
| Tip | `:::tip` ... `:::` | Callout. |
| Inline cards | `{{Kh 7d}}` | Rank `A23456789TJQK`, suit `shdc`. Parsed with the engine's `parseCards`; bad or duplicate cards fail. `{{Kh 7d =}}` adds a visible total badge, `{{Kh 7d =7}}` also asserts the baccarat total (A = 1, T/J/Q/K = 0, sum mod 10). The aria label always includes the total. Works in prose, tips, quiz text and scene step text; not inside code spans. |
| Glossary link | `[[term]]` or `[[term\|label]]` | The term (or slug) must exist in `glossary.json`. |
| Tableau | ` ```tableau ` YAML `{ view, highlight? }` | `view` is `player`, `banker` or `full`. Cells use the simulator's `TableauCellId`: `b<0-7>/p<0-9>` (Banker total / Player third card), `b<0-7>/s` (Player stood) `p<0-9>` for the Player rule and `nat` for a natural, e.g. `[b5/p4, b6/s, p5]`. The same ids work in `#/rules?highlight=`. |
| Roads | ` ```roads ` YAML `{ results, view?, caption? }` | `results` is parsed by the engine's `parseRoadString`: tokens `[BPT][b][p][n][0-9]`, i.e. `B` Banker, `P` Player, `T` Tie, then optional `b` (Banker pair), `p` (Player pair), `n` (natural) in that order and an optional total (default 7, Tie 0). Spaces are optional: `BBPBTPPpPb` or `B Bbp P5 T Pn9`. `view` is a subset of `bead`, `big` (default both). |
| Scene | ` ```scene ` YAML | A `SceneConfig` (`docs/design/simulator.md` §5.1), money in cents, forced hands on the step that deals them. Checked by `validateScene`. Scene ids are unique within a lesson. |
| Quiz | ` ```quiz ` YAML list | See below. |

Unknown directives (` ```math `, ` ```chart `, an unknown `:::name`) and unclosed fences or containers are errors.

### Quizzes

```quiz
- id: optional-custom-id
  q: Does the Banker draw?
  hand: { player: [4h, Ac, 9d], banker: [Kd, 5s] }
  options: [Draw, Stand]
  answer: 1
  explain: Banker 5 draws only when the Player's third card is 4 to 7.
```

- At least two distinct options; `answer` is a 0-based index; `explain` is required.
- `hand` lists the cards of each side as YAML lists (`[4h, Ac, 9d]`): 2 or 3 cards per side, no card on both sides, and a third card exactly where the drawing rules say so (checked with the engine's `playerDraws` and `bankerDraws`).
- The default id is `<lessonId>-q<n>` (1-based per lesson). Ids must be unique.

## Links into the app

Plain Markdown links to hash routes work in prose, tips and math boxes:

| Link | Opens |
| --- | --- |
| `#/rules?highlight=b5/p4` | The drawing rules with that cell highlighted and described in words |
| `#/drill?mode=banker&cat=banker-5` | The Drill on one category (`mode`: `player`, `banker`, `winner`, `payout`, `mixed`; `cat`: a `DrillCategoryId`) |
| `#/drill?mode=banker&focus=b5/p4` | The Drill on one tableau cell; `focus=misses` replays the learner's misses |
| `#/play?shoe=3h,Kd,2c,5s,6d` | The table with a forced deal (P1 B1 P2 B2 P3 B3 order); also `?variant=`, `?tie=`, `?seed=`, `?system=` |
| `#/bets/banker` | A bet's paytable per variant, edge per bet placed and the ties-excluded edge |
| `#/glossary?term=natural` | A glossary entry |
| `#/roads` | The scoreboard explainer |

## How a lesson renders

Blocks render in source order: prose, tips, closed "Show the math" boxes, the tableau chart (with each
highlighted cell also written out in words), a static scoreboard for `roads`, the table for each scene
(mounted when it scrolls into view) and each quiz. A quiz `hand` is drawn above the question as
"Player" and "Banker" cards with their totals. Progress (quiz answers with first try, scene steps,
"Mark complete") is saved per lesson; all lessons are open.

## Tests

- `tests/content/compile.test.ts`: every construct, good and bad.
- `tests/content/content.test.ts`: chapters and lessons both ways, `bets.json` / `systems.json` cover
  exactly the engine's bet ids and the strategy ids once real content exists, every reference resolves.
- `tests/content/lessons-{a,b,c}.test.ts` (one per content WP): front matter, banned wording, and every
  number the prose quotes recomputed with math.
