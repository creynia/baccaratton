# Chips (deferred ideas and open items)

Self-contained ideas to pick up later. Open an issue or PR and link it here when you start one.

- Derived roads (Big Eye Boy, Small Road, Cockroach Pig) drawn live; today they are explained only (D4).
- Super 6 side bet, Either/Perfect Pair, Big/Small, Egalité and Tiger bets (D3: lesson text only).
- A commission-box mode (lesson text only today, D15).
- Dragon 7 true-count display in the Shoe tracker.
- A counting preset that bets the EZ side bets only when the tracker is positive.
- Squeeze reveal (declined in D7; described in a lesson).
- Sound effects.
- Money values never wrap at the minus sign (`white-space: nowrap`).
- Vite "configLoader native" warning: load `src/content/load` via `runnerImport` in `build/vite-plugin-content.ts` (infra's patch, held while app owned the file).
- Auto-play panel: custom side-bet amounts; legend cost per hour (simulator §6.4).
- Drill heat map per tableau cell (needs per-cell stats).
- Spot sheet on long-press (table-ui `onLongPress` hook exists).
- Auto-play results table scrolls sideways at 390 px (integration review).
- Landscape lesson scenes get a small felt; consider a scene-specific landscape layout (integration review).
- Auto-play perf: first hand after load ≈70 ms while the engine JIT warms up (integration).
