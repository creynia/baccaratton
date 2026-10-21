# baccaratton design decisions

**This file is authoritative.** Where it disagrees with `curriculum.md`, `simulator.md` or
`architecture.md`, this file wins.

## 1. User answers

| # | Topic | Decision |
|---|---|---|
| D1 | Merging | The orchestrator merges PRs (merge commit) after an Opus review and green CI on the latest head. Branches: `main` + `claude/baccaratton-*`. Repo public; Pages source = GitHub Actions. |
| D2 | Default rules | 8 decks, Banker pays 1:1 less 5% commission, Tie 8:1. EZ Baccarat and Super 6 are Settings variants. |
| D3 | Simulated side bets | Player/Banker Pair, Dragon 7 / Panda 8 (EZ only), Dragon Bonus (Player and Banker). Others are explained in lessons only. |
| D4 | Roads | Bead plate + Big Road, with a gambler's-fallacy lesson. Derived roads are explained only. |
| D5 | Hands per hour | 72, for every cost-per-hour figure. |
| D6 | Current-shoe EV | The EV sheet shows full-shoe EV. An optional **Shoe tracker** (off by default; the counting lesson turns it on) shows live exact EV for the cards left in the shoe. |
| D7 | Card reveal | Quick flip only. No squeeze in the app; the squeeze is described in a lesson. |
| D8 | Shoe | Real shoe only: 8 decks, burn by the first card's value, cut card 16 cards from the end, reshuffle after the shoe. No continuous-shuffle option. |
| D10 | Theme | Burgundy felt `#5c1a2b` with gold trim; the same `theme_color`. |
| D11 | Tabs | Learn · Play · Drill · More. Drill = third-card-rule trainer; Bets, Roads, Glossary under More. |
| D12 | First view | A Claude Artifact of the single-file build as soon as the table deals, then Pages. GitHub Actions/Pages is already enabled: **the Pages deploy workflow ships in WP0**, so every merge to `main` deploys from the start. |

## 2. Orchestrator calls

| # | Topic | Decision |
|---|---|---|
| D9 | Betting systems | Every system is an auto-play preset (flat Banker/Player/Tie, Martingale, Paroli, 1-3-2-6, Fibonacci, D'Alembert, Labouchère, follow-the-shoe), compared on the same seed with bankroll charts. |
