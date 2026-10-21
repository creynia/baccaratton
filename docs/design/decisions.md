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
| D13 | Ids | Bets: `player`, `banker`, `tie`, `player-pair`, `banker-pair`, `dragon-bonus-player`, `dragon-bonus-banker`, `dragon-7`, `panda-8` (the last two in `ez` only). Variants: `punto-banco` (default), `ez`, `super-6`; one `SimSettings.variant` field (architecture's `commission: 'classic'` is replaced). Tie 9:1 is a separate setting (`tiePays`). Strategies: `flat-banker`, `flat-player`, `flat-tie`, `martingale`, `paroli`, `one-three-two-six`, `fibonacci`, `dalembert`, `labouchere`, `follow-the-shoe`, `side-bet-sprinkler`. Chapter and lesson ids: curriculum.md §4 (24 lessons, 7 chapters). |
| D14 | Primary metric | **House edge per bet placed**, ties counted as a push for Player and Banker. Shown as % and as $ per hand and $ per hour (72/h). The per-resolved-bet figure (ties excluded) appears only in "Why?". Element of risk is not used (it equals the house edge for every baccarat bet). |
| D15 | Commission | Taken from the win at settlement. Rule: gross rounds down, commission rounds up (simulator.md §1.5). Bets are whole dollars, so rounding never fires; a registry test asserts this. The curriculum's "round commission down" note is superseded and moot. The commission box is lesson text only (chip). |
| D16 | Table limits | $5 minimum and $5,000 maximum on Player/Banker; Tie and side bets $1–$500; chips $1, $5, $25, $100, $500 (curriculum.md §2.1). |
| D17 | Shoe end | When the cut card comes out, the hand completes, **one more hand** is dealt, then the next Deal reshuffles. Forced cards are swapped into the shoe; a forced card with no copy left triggers a reshuffle first. |
| D18 | EV transport | No Web Worker (architecture Plan A). The EV sheet is synchronous; exact full recompute ≈ 1.4 ms desktop. The Shoe tracker recomputes after every hand. Multi-hand simulation runs through the time-sliced same-thread job client (`src/sim/jobs`), one `simulate` job kind. |
| D19 | Tiers | On edge per bet placed: `free` ≤ 0 < `good` ≤ 2% < `fair` ≤ 5% < `costly` < 9% ≤ `sucker`. Text label always. `sucker` needs a second tap ("Bet it anyway") when `confirmCostlyBets` (default on); `costly` shows the better-alternative card. In `super-6`, the alternative for Banker is Player. |
| D20 | Empty-felt deal | Allowed (a no-money hand) for roads lessons and follow-the-shoe waiting. |
| D21 | Auto-play lengths | 72 / 720 / 7,200 hands (1, 10, 100 hours). |
| D22 | Roads & Drill placement | Roads in `src/sim/engine/roads.ts`; Drill in `src/sim/strategy/drill.ts`. |
| D23 | Scenes | The `SceneConfig` in simulator.md §5.1 is authoritative; the curriculum's scene names map 1:1 (simulator.md §5.3). |
| D24 | File ownership | simulator.md §8 wins inside `src/sim/**`; architecture.md for the rest. Content split: **content-a** lessons 1–8 + `content/*.json`; **content-b** lessons 9–16; **content-c** lessons 17–24. |
| D25 | Pinned numbers | simulator.md §2.5 is the source of the pinned fractions; curriculum.md must match it. |
