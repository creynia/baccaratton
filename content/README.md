# content/

Lesson sources for baccaratton. Everything is plain text and checked at build time and by `tests/content/`.
The full guide is `docs/authoring.md`.

- `lessons/NN-slug.md`: one lesson. Front matter `id` (equals the slug), `title`, `chapter`, `summary`, `minutes`.
- `chapters.json`: ordered chapters `{ id, title, summary, lessons: [lessonId] }`.
- `glossary.json`: `[{ term, slug?, definition, see?, seeAlso?: lessonId }]`.
- `bets.json`: keyed by bet id (`player`, `banker`, `tie`, `player-pair`, `banker-pair`, `dragon-bonus-player`, `dragon-bonus-banker`, `dragon-7`, `panda-8`).
  `systems.json`: keyed by betting-system id (`flat-banker`, `martingale`, ...). No numbers in these files: they come from the engine and math.
- Placeholders: while a real JSON file is missing, `tests/fixtures/content/_sample-*.json` is used instead (and
  `tests/fixtures/content/lessons/_sample-*.md` only while `chapters.json` is missing). Do not edit them to write real content.

Body extras: `:::math Title` ... `:::`, `:::tip` ... `:::`, inline cards `{{Kh 7d}}` (optionally `{{Kh 7d =}}` or `{{Kh 7d =7}}`),
a ` ```tableau ` block, a ` ```roads ` block, a ` ```scene ` block (simulator `SceneConfig`, money in cents) and a
` ```quiz ` block with an optional `hand: { player: [..], banker: [..] }`. **An invalid scene, quiz, tableau, roads block or card fails the build.**
Tableau cells: `b5/p4`, `b6/s`, `p5`, `nat` (the same ids as `#/rules?highlight=`). App deep links: `docs/authoring.md`.

## Pending links (content-b/c)

These `lessonId` / `seeAlso` links are left out until the lesson exists (request the JSON baton from content-a via main to add them).

| File | Entry | Link to |
| --- | --- | --- |
| glossary.json | Per resolved bet, Element of risk | `edge-and-hourly-cost` |
| glossary.json | EZ Baccarat, Super 6 | `table-variants` |
| glossary.json | Bankroll, Session, Variance, Standard deviation | `variance-and-bankroll` |
| glossary.json | Bead Plate, Big Road, Derived roads, Gambler's fallacy | `roads-and-streaks` |
| glossary.json | Shoe, Burn, Cut card, Shoe tracker, Card counting, Effects of removal | `card-counting` |
| glossary.json | Betting system, Flat betting, Unit | `betting-systems` |
| glossary.json | Side bet, Pair, Dragon Bonus | `pairs-and-dragon-bonus` |
| glossary.json | Dragon 7, Panda 8 | `ez-side-bets` |
| glossary.json | Squeeze, Mini-baccarat, Chemin de Fer | `at-the-casino` |
| bets.json | `player-pair`, `banker-pair`, `dragon-bonus-player`, `dragon-bonus-banker` | `pairs-and-dragon-bonus` |
| bets.json | `dragon-7`, `panda-8` | `ez-side-bets` |
| systems.json | `flat-banker`, `flat-player` | `banker-vs-player` |
| systems.json | `flat-tie` | `the-tie-bet` |
| systems.json | `martingale`, `paroli`, `one-three-two-six`, `fibonacci`, `dalembert`, `labouchere`, `follow-the-shoe` | `betting-systems` |
| systems.json | `side-bet-sprinkler` | `strategy-fun-per-dollar` |
| chapters.json | `perfect-lowest-edge`, `perfect-practical`, `perfect-fun`, `real-casino` | append lesson ids 11–24 (and 9, 10 to `ev-basics`) |
