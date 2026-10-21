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
| Tableau | ` ```tableau ` YAML `{ view, highlight? }` | `view` is `player`, `banker` or `both`. Cells: `B<0-7>-P<0-9>` or `B<0-7>-Pnone` (Banker total, Player third card or "stood"), and `P<0-9>` for the Player rule. |
| Roads | ` ```roads ` YAML `{ results, view?, caption? }` | `results` like `BBPBTPPpPb`: `B` Banker, `P` Player, `T` Tie, then optional lowercase `p` / `b` pair marks. `view` is a subset of `bead`, `big` (default both). |
| Scene | ` ```scene ` YAML | A `SceneConfig` (`docs/design/simulator.md` §5.1), money in cents, forced hands on the step that deals them. Checked by `validateScene`. Scene ids are unique within a lesson. |
| Quiz | ` ```quiz ` YAML list | See below. |

Unknown directives (` ```math `, ` ```chart `, an unknown `:::name`) and unclosed fences or containers are errors.

### Quizzes

```quiz
- id: optional-custom-id
  q: Does the Banker draw?
  hand: { player: 4h Ac 9d, banker: Kd 5s }
  options: [Draw, Stand]
  answer: 1
  explain: Banker 5 draws only when the Player's third card is 4 to 7.
```

- At least two distinct options; `answer` is a 0-based index; `explain` is required.
- `hand` has 2 or 3 cards per side, no card on both sides, and a third card exactly where the drawing rules say so (checked with the engine's `playerDraws` and `bankerDraws`).
- The default id is `<lessonId>-q<n>` (1-based per lesson). Ids must be unique.
