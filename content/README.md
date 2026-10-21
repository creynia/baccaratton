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
