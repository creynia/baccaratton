# baccaratton: curriculum and Punto Banco reference

Status: design spike (content), ready for reconciliation. Owner: curriculum spike.
This document is the **source of truth for all learner-facing text and all baccarat math**
(authority order: `decisions.md` > this file and the other design docs > holdumb > crappy).
The lesson prose is final copy and is meant to ship as written.

Every number in this file was computed by this spike. Most come from **exact enumeration** of the
Punto Banco tableau over the shoe's composition, without replacement, in exact rationals
(Python `fractions`, with integer weights over all ordered 6-card sequences). A few are
**Monte Carlo estimates** or **normal approximations**. Those are marked "≈ … simulated" or
"≈ approx." wherever they appear. §12 lists the method behind each figure. The scratch code is in
`/tmp/baccaratton-scratch/curriculum/` (`tableau.py`, `bets.py`, `eor.py`, `systems.py`, `sessions.py`,
`shoe_burn.c`, `streaks.py`, `deals.py`, `comps.py`).

User answers that shape this file (from `decisions.md`):

* D2: 8 decks, Banker 1:1 less 5% commission, Tie 8:1. EZ and Super 6 are variants.
* D3: Pairs, Dragon 7 / Panda 8 (EZ only) and Dragon Bonus are simulated. Every other side bet is lesson-only.
* D4: Bead Plate and Big Road are drawn, and derived roads are explained only.
* D5: 72 hands per hour.
* D6: the EV sheet shows full-shoe EV, and the Shoe tracker is opt-in.
* D7: no squeeze in the app.
* D8: a real shoe with burn and a cut card.
* D9: every betting system is an auto-play preset.
* D11: the Drill tab is the third-card trainer.

Contents

1. [Conventions for the app](#1-conventions-for-the-app)
2. [House rules, variants and paytables](#2-house-rules-variants-and-paytables)
3. [Metrics: what "house edge" means here](#3-metrics-what-house-edge-means-here)
4. [Course map](#4-course-map)
5. [Lessons](#5-lessons)
6. [Reference table: every bet](#6-reference-table-every-bet)
7. [Strategy and system reference](#7-strategy-and-system-reference)
8. [How EV is shown](#8-how-ev-is-shown)
9. [Drill: the third-card trainer and "which bet?" spots](#9-drill-the-third-card-trainer-and-which-bet-spots)
10. [How EV is computed in the app (recommendation)](#10-how-ev-is-computed-in-the-app-recommendation)
11. [Exact values for unit tests](#11-exact-values-for-unit-tests)
12. [Verification notes and sources](#12-verification-notes-and-sources)
13. [Assumptions and open points for decisions.md](#13-assumptions-and-open-points-for-decisionsmd)

---

## 1. Conventions for the app

### 1.1 Content markup

Same format as holdumb (`architecture.md` §3.2 there):

| Block | Syntax | Use here |
|---|---|---|
| Show the math | `:::math Title` … `:::` | A collapsible box, closed by default. The lesson must read fine with every box closed. |
| Tip | `:::tip` … `:::` | Etiquette or practical advice. |
| Inline cards | `{{9h Kd}}` | Cards drawn inline, with suit glyphs and an aria label. They also render in quizzes. |
| Rule table | ` ```tableau ` YAML `{view: player \| banker \| full, highlight?}` | The third-card rule, drawn from the engine's own rule table and never typed by hand. `highlight: [b4/p2]` marks a cell, using the simulator's `TableauCellId` syntax (`b4/p7`, `b6/s`, `p5`, `nat`), the same one as `#/rules?highlight=` (D34). |
| Scene | ` ```scene ` YAML | An embedded simulator (1.2). |
| Quiz | ` ```quiz ` YAML list `{q, options, answer (0-based), explain, hand?}` | At the end of each lesson. `hand: {player: [Jc, 7s], banker: [4d, 4h]}` (YAML arrays) draws the cards above the question. |
| Roads | ` ```roads ` string | A static Bead Plate / Big Road picture, parsed by engine `parseRoadString` (`engine/roads.ts`, D34). Not used in v1 lessons (scenes prefill `history` instead). |

Card codes: rank `A23456789TJQK` plus suit `shdc` (`9h`, `Td`). Point values: A = 1, 2–9 face value,
T/J/Q/K = 0. In compositions, value class `0` means the 16 ten-value cards per deck.

### 1.2 Scenes

Scenes are written in the simulator's **`SceneConfig`** (`simulator.md` §5.1, authoritative per D23/D26).
This file doesn't define its own schema. The rules (D26–D28, D36) that apply to every scene here:

* Money is in **cents**: `bankroll`, `bets: { player, banker, tie, player-pair, banker-pair, dragon-7, panda-8,
  dragon-bonus-player, dragon-bonus-banker }`. `variant: punto-banco | ez | super-6` (default `punto-banco`).
  `allowedBets` lists the spots that accept chips. `allowedActions` takes values from `set-bet`, `clear-bets`, `deal`, `rebet`.
  With `rebet` allowed and last hand's bets remembered, the empty-felt Deal button reads "**Rebet & Deal**".
* **Forced hands go on the step that deals them**: `deals: [{ player: [c1, c2, c3?], banker: [c1, c2, c3?] }]`
  (`ForcedHand`). The engine deals them in the real order (P1, B1, P2, B2, then P3, then B3), and `validateScene`
  checks that each hand obeys the tableau: a third card is present exactly when the rule draws one.
* **Betting steps lock Deal.** They allow only `set-bet` / `clear-bets` and complete on `betOnFelt`. A separate
  step allows only `deal` and carries the forced hand.
* **Prediction steps** (third-card teaching, D27): `predict: { kind: player-draws | banker-draws | hand-total |
  winner, side? }` with `pauseAt: two-cards | player-third | all-cards`, `allowedActions: [deal]` and the step's
  `deals`. The learner taps **Deal**, the reveal stops at the pause, and the PredictBar asks. The buttons are
  **Draw · Stand**, a 0–9 keypad for `hand-total` (with `side`), and Player · Banker · Tie for `winner`. On a
  natural, "Does the Player draw?" is answered **Stand** (rule `natural`). There is no separate natural button.
  A wrong answer shows the `hint` and the deciding rule row, then the reveal continues. **There is no replay.**
  * A single forced-hand step completes on `{ predicted: { count: 1 } }`, so the next step's text is true
    whatever was answered.
  * Random-hand steps use `{ predicted: { correct: true, count: n } }` with scene-level `onDealsExhausted: random`
    and step-level `skipNaturals: true`. On a natural no PredictBar shows and the hand doesn't count.
* **Result steps** are `{ acknowledged: true }` with `advance: button` and `allowedActions: []`. **Read steps** after
  auto-play also set `allowedActions: []`. `hands: n` counts only hands dealt since the step started.
* Conditions used: `action {type}`, `hands n`, `handResult {winner, natural?}`, `betOnFelt {bet, minAmount?}`,
  `previewed {bet}`, `tapped {target}` (bet ids, `commission` (the settlement toast's commission line, D35),
  `bead-plate`, `big-road`, `shoe-tracker`, `session`), `predicted`, `autoPlayCompleted {minHands?}`,
  `acknowledged`, `all` / `any`.
* The shoe: `shoe: fresh` (default: 8 decks, burn, cut card 16 from the end, one more hand after it, D8/D17) or
  `shoe: { removed: {value: count} }` (`ShoeSetup`: cards already seen, removed = 8-deck count − the
  composition wanted). A setup may leave as few as 6 unseen cards (D36). `ui.shoeTracker: true` opens the Shoe
  tracker (D6). `ui.roads: [bead-plate, big-road]` and `history: [B, P, T, …]` prefill the scoreboards.
* Auto-play: `autoPlay: { enabled, defaultStrategy, handOptions, sessions, compare }` with `StrategySpec
  { id, unit, target?, sideBets?, sequence?, label?, maxSteps?, maxUnits?, maxBetUnits? }` (D28) and
  `ui.speed: fast`. Lengths are D21's 72 / 720 hands. A scene completes on `autoPlayCompleted { minHands }`
  (requested hands per session; a busted session still counts as complete). Every auto-play scene's bankroll makes a
  bust rare (§7.2). `compare` entries all run on the **same seed** (the same cards), each with its own full
  spec (`label` when two entries share an id), and `autoPlayCompleted` fires only when **every** entry has finished.

Every forced hand in this file is machine-checked against the tableau (`deals.py`, `checkdoc.py`). The totals and winner
each step's text describes match the engine's settlement.

### 1.3 Ids

* Bet ids: `player`, `banker`, `tie`, `player-pair`, `banker-pair`, `dragon-7`, `panda-8` (both EZ only),
  `dragon-bonus-player`, `dragon-bonus-banker`.
* Mentioned-only side bets (copy only, no engine id): `either-pair`, `perfect-pair`, `lucky-6`, `big`, `small`,
  `super-6-side`, `tie-9-to-1` (a paytable, not simulated).
* Rule variant ids: `punto-banco` (default), `ez`, `super-6`.
* Strategy (auto-play preset) ids: `flat-banker`, `flat-player`, `flat-tie`, `martingale`, `paroli`,
  `one-three-two-six`, `fibonacci`, `dalembert`, `labouchere`, `follow-the-shoe`.
* Drill category ids: §9.1.
* Lesson ids are kebab-case (§4). Chapter ids: `foundations`, `third-card-rule`, `ev-basics`,
  `perfect-lowest-edge`, `perfect-practical`, `perfect-fun`, `real-casino`.
* Scene ids: `lNN-sN`.

---

## 2. House rules, variants and paytables

### 2.1 Punto Banco (`punto-banco`, default, D2)

| Rule | Value |
|---|---|
| Shoe | 8 decks (416 cards), shuffled together. The first card is turned up and that many cards are **burned** face down (T/J/Q/K burn 10). A **cut card** goes 16 cards from the end. The hand in progress when it appears is finished, plus one more hand by the common rule (simulator decides; see §13). Then the shoe is reshuffled (D8). |
| Card values | A = 1, 2–9 = face value, T/J/Q/K = 0. A hand's **total** is the sum of its cards, **last digit only** (7 + 8 = 15 → 5). Totals run 0–9. |
| Deal | Player, Banker, Player, Banker: two cards each, face up. |
| Natural | If either hand totals **8 or 9** on two cards, both hands stand. Nobody draws. |
| Player's rule | Player **draws** a third card on **0–5** and **stands** on **6–7**. |
| Banker's rule, Player stood | Banker draws on **0–5** and stands on **6–7** (the Player's rule). |
| Banker's rule, Player drew | Depends on the Banker total and the Player's **third card**: see 2.2. |
| Winner | The higher total wins. Equal totals are a **Tie**. |
| Player bet | Pays **1:1**. On a tie it **pushes** (returned). |
| Banker bet | Pays **1:1 less 5% commission** (a $20 win pays $19). Pushes on a tie. In the app, commission is taken at settlement in cents. A real table tracks it in a commission box (lesson 23). |
| Tie bet | Pays **8:1**. Loses when either hand wins. |
| Limits (app defaults) | $5 minimum, $5,000 maximum on Player/Banker; Tie and side bets $1–$500. Chips $1, $5, $25, $100, $500. (Simulator owns these; they only matter to the systems lesson.) |

### 2.2 The Banker's third-card table (Player drew a third card)

| Banker total | Banker draws when the Player's third card is | Banker stands when it is |
|---|---|---|
| 0, 1, 2 | anything | — |
| 3 | anything except 8 | 8 |
| 4 | 2, 3, 4, 5, 6, 7 | 0, 1, 8, 9 |
| 5 | 4, 5, 6, 7 | 0, 1, 2, 3, 8, 9 |
| 6 | 6, 7 | 0–5, 8, 9 |
| 7 | — (always stands) | anything |

(8 and 9 can't get here: they are naturals.) A ten-value third card counts as **0**.

The memory hook used in lesson 5: **"From 3, the window starts at 0 and slides up by two each step:
3 → 0–7 and 9 (all but 8), 4 → 2–7, 5 → 4–7, 6 → 6–7. The top end is always 7."**

### 2.3 Variants (Settings, D2)

| Variant | What changes | Banker edge |
|---|---|---|
| `ez` (EZ Baccarat) | **No commission.** Banker pays 1:1, except a Banker win with a **three-card 7** ("Dragon 7") **pushes**. Unlocks the **Dragon 7** (40:1) and **Panda 8** (25:1) side bets. Player and Tie unchanged. | 1.0183% |
| `super-6` (Super 6 / Punto 2000) | **No commission.** Banker pays 1:1, except a Banker win with a total of **6** (two or three cards) pays **1:2** (half). Player and Tie unchanged. | 1.4581% |

Lesson-only variants:

* **Tie 9:1**: 4.8440%.
* **4% commission**: Banker edge 0.5993%.
* **6-deck shoe**: Banker 1.0558%, Player 1.2374%, Tie 8:1 14.4382%, Pair 11.2540%.
* **Chemin de Fer** and **Baccarat Banque**: players bank, and the Player's draw on 5 is optional. These are
  described only, in lesson 23.

### 2.4 Side bets

Simulated (D3). Payouts are "to 1", and the bet loses on anything not listed.

| Bet | Wins when | Pays | Edge (8 decks) |
|---|---|---|---|
| `player-pair` / `banker-pair` | That hand's first two cards are the **same rank** (Q-Q yes, Q-K no) | 11:1 | 43/415 = 10.3614% |
| `dragon-7` (EZ only) | Banker wins with a **three-card 7** | 40:1 | 7.6113% |
| `panda-8` (EZ only) | Player wins with a **three-card 8** | 25:1 | 10.1876% |
| `dragon-bonus-player` / `-banker` | Your side **wins with a natural**: 1:1. **Natural tie**: push. **Wins without a natural** by 9 points: 30:1, by 8: 10:1, by 7: 6:1, by 6: 4:1, by 5: 2:1, by 4: 1:1. Anything else loses. | see left | Player 2.6517%, Banker 9.3731% |

Mentioned only (lessons 21 and 22). These paytables vary, and the edge is quoted for the table shown.

| Bet | Wins when | Example paytable | Edge (8 decks) |
|---|---|---|---|
| Either Pair | Either hand's first two cards are a pair | 5:1 | 108091/788417 = 13.7099% |
| Perfect Pair | Either hand's first two cards are a **suited** pair (same rank and suit) | 25:1, or 200:1 if both | 135952/1689465 = 8.0470% (25:1 only: 13.0294%) |
| Lucky 6 | Banker wins with a 6 | 12:1 (two cards), 20:1 (three cards) | 16.6836% |
| Big / Small | The hand uses 5–6 cards (Big) / exactly 4 (Small) | Big 0.54:1, Small 1.5:1 | Big 22999/529230 = 4.3457%, Small 19571/370461 = 5.2829% |
| Tie 9:1 | Tie | 9:1 | 4.8440% |
| Super 6 side bet (commission tables) | Banker wins with a 6 | 12:1 | 1 − 13·P = 90046773893/300384511749 = 29.9772%, where P(Banker wins with 6) = 210337737856/3904998652737 (§11). At 15:1: 13.8181%. |

---

## 3. Metrics: what "house edge" means here

Baccarat's main bets **push** on a tie, so there are two honest ways to quote the cost:

| Metric | Definition | Banker | Player | Tie 8:1 |
|---|---|---|---|---|
| **House edge per hand** (PRIMARY) | Expected loss ÷ amount bet, **ties counted as pushes** (a hand where the bet came back) | **1.0579%** | **1.2351%** | **14.3596%** |
| House edge per resolved bet | Expected loss ÷ amount bet, ignoring hands that pushed ("ties excluded") | 1.1692% | 1.3650% | 14.3596% |
| Element of risk | Expected loss ÷ total amount wagered | = per hand | = per hand | = per hand |

**Recommendation (for `decisions.md`): house edge per hand is the one primary metric.** It's the figure
casinos and most sources quote. It maps straight to money: **expected cost per hand = edge × bet**,
and **expected cost per hour = 72 × bet × edge** (D5). The per-resolved figure is shown only in the
"Show the math" box of lesson 13, so that a learner who meets "1.17%" elsewhere knows what it is. Element
of risk is **identical** to the per-hand edge for every baccarat bet: you can't add money to a bet once the
cards are out. It's mentioned once (lesson 14) and never displayed.

**Per hand of play** (several bets at once): expected cost = Σ bet × edge. Side bets add at their own size
and edge.

**Per hour** = 72 hands × Σ (bet × edge). At 72 hands per hour:

| Bet | $10 | $25 | $100 |
|---|---|---|---|
| Banker | $7.62 | $19.04 | $76.17 |
| Player | $8.89 | $22.23 | $88.93 |
| Tie 8:1 | $103.39 | $258.47 | $1,033.89 |
| EZ Banker | $7.33 | $18.33 | $73.32 |
| Super 6 Banker | $10.50 | $26.25 | $104.98 |

72 is a typical pace for a mini-baccarat table. A full big table with the squeeze runs closer to 40 hands
an hour, which is said in lesson 23. The setting scales every per-hour figure linearly.

**Exact vs simulated.** Every bet EV in the EV sheet is **exact** (full shoe). The Shoe tracker shows
exact EVs **for the cards left**. Auto-play results, session ranges and betting-system costs from Monte
Carlo are labelled "≈ … simulated". Betting-system hourly costs in §7.2 are **exact** expectations (a
Markov chain over the system's states), except Labouchère, which is simulated.

---

## 4. Course map

The course has **24 units in 7 chapters**: 22 teaching lessons, a checkpoint (lesson 13) and a final exam
(lesson 24). Every unit ends with a quiz. All lessons are open (no gating). Checkpoints (✔) are cumulative
quizzes with one practical scene.

| # | Lesson id | Title | Chapter |
|---|---|---|---|
| 1 | `welcome` | Welcome to baccarat | 1. Foundations (`foundations`) |
| 2 | `card-values` | Counting a hand: only the last digit | 1. Foundations |
| 3 | `naturals-and-player-rule` | Naturals, and when the Player draws | 2. The third-card rule (`third-card-rule`) |
| 4 | `banker-when-player-stands` | The Banker's turn, part 1: when the Player stood | 2. The third-card rule |
| 5 | `banker-third-card-table` | The Banker's turn, part 2: the table | 2. The third-card rule |
| 6 | `third-card-practice` | Calling the hand like a dealer | 2. The third-card rule |
| 7 | `settling-bets` | Who gets paid: commission, ties and pushes | 3. EV basics (`ev-basics`) |
| 8 | `expected-value` | EV and the house edge, in plain English | 3. EV basics |
| 9 | `banker-vs-player` | Why the Banker wins more often | 3. EV basics |
| 10 | `the-tie-bet` | The Tie bet: 8 to 1 isn't enough | 3. EV basics |
| 11 | `strategy-lowest-edge` | Perfect strategy I: the lowest edge | 4. Perfect strategy I: lowest edge (`perfect-lowest-edge`) |
| 12 | `table-variants` | Choosing a table: commission, EZ and Super 6 | 4. Perfect strategy I |
| 13 | `checkpoint-strategy` ✔ | Checkpoint: rules and the best bet | 4. Perfect strategy I |
| 14 | `edge-and-hourly-cost` | House edge, per hand and per hour | 5. Perfect strategy II: practical (`perfect-practical`) |
| 15 | `variance-and-bankroll` | Swings, sessions and bankroll | 5. Perfect strategy II |
| 16 | `roads-and-streaks` | Scoreboards, streaks and the gambler's fallacy | 5. Perfect strategy II |
| 17 | `card-counting` | Can you count cards at baccarat? | 5. Perfect strategy II |
| 18 | `strategy-practical` | Perfect strategy II: a plan you can follow | 5. Perfect strategy II |
| 19 | `betting-systems` | Martingale, Paroli and friends: what they really cost | 6. Perfect strategy III: fun per dollar (`perfect-fun`) |
| 20 | `pairs-and-dragon-bonus` | Pairs and the Dragon Bonus | 6. Perfect strategy III |
| 21 | `ez-side-bets` | Dragon 7, Panda 8 and the rest of the side bets | 6. Perfect strategy III |
| 22 | `strategy-fun-per-dollar` | Perfect strategy III: the most fun per dollar | 6. Perfect strategy III |
| 23 | `at-the-casino` | Playing at a real table | 7. The real casino (`real-casino`) |
| 24 | `final-exam` ✔ | Final exam | 7. The real casino |

**Teaching approach.** Baccarat has no player decisions after the bet. The one mechanic a learner must
master is the **third-card rule**, so it gets its own chapter of four lessons. The sequence is: totals →
naturals and the Player's rule → the Banker when the Player stood (same rule) → the Banker's table, one row
at a time → mixed practice → the Drill tab. Each idea comes first in plain English, then as a staged
"what happens next?" scene (the deal pauses and you call it), then as optional math. The EV sheet appears
from lesson 8 on. From then, every bet shows its price before you confirm it. Auto-play is held back until
lesson 9 (who wins more) and becomes central in lessons 15 and 19. The three strategy chapters follow the
playbook's lenses:

* **The lowest edge**: bet Banker, at the cheapest table.
* **Practical**: bet size, bankroll, sessions, commission and the myths that cost money.
* **Fun per dollar**: systems and side bets, priced per hour.

**Chapter summaries** (for `chapters.json`):

| id | title | summary |
|---|---|---|
| `foundations` | Foundations | Three bets, two hands, and how to count a baccarat hand. |
| `third-card-rule` | The third-card rule | When each hand draws. The only rule you need to master, and the dealer applies it for you. |
| `ev-basics` | EV basics | How bets are paid, what each one costs, and why Banker is the best of the three. |
| `perfect-lowest-edge` | Perfect strategy I: lowest edge | The cheapest bet at the cheapest table: 1.06% or less. |
| `perfect-practical` | Perfect strategy II: practical | Bankroll, sessions, scoreboards and counting, and what really matters. |
| `perfect-fun` | Perfect strategy III: fun per dollar | Betting systems and side bets, priced per hour. |
| `real-casino` | The real casino | Table types, the squeeze, commission, etiquette and the final exam. |

---

## 5. Lessons

---

### Lesson 1: `welcome`: Welcome to baccarat

**Front matter:** `chapter: foundations` · `minutes: 4` · summary: "Two hands, three bets, no decisions after you bet."

**Objectives**

* Know that baccarat deals two hands, **Player** and **Banker**, and that you bet on which one wins.
* Name the three main bets: Player, Banker and Tie.
* Know that you make **no decisions** once the cards are out. The dealer follows fixed rules.

**Lesson**

Baccarat (say "bah-kah-RAH") is one of the simplest games in the casino, and one of the cheapest to play.
The version almost every casino deals is called **Punto Banco**, and that's what this app teaches.

The dealer deals two hands. One is called **Player** and the other **Banker**. Those are just names.
You aren't the Player, and the casino isn't the Banker. Before the cards come out, you bet on the hand
you think will win:

* **Player** pays 1 to 1: bet $10, win $10.
* **Banker** pays 1 to 1, minus a 5% commission: bet $10, win $9.50.
* **Tie** (both hands end equal) pays 8 to 1: bet $10, win $80.

Then the dealer deals and the hand plays itself. Each hand gets two cards, sometimes a third, and the
hand **closer to 9** wins. Whether a hand takes a third card is decided by a fixed rule, never by
you or the dealer. You'll learn that rule in chapter 2, but you never have to apply it at a real table.
It's still worth knowing, because it explains everything else: why Banker wins more often, why it pays a
commission, and why so many side bets exist.

So where's the strategy? It's in **which bet you make, at which table, and how much**. The bets have very
different prices. This course shows the exact price of each one before you bet, so you can choose with
your eyes open.

:::tip
Players and Banker aren't seats. At a real table, anybody can bet on either hand, and many people switch back and forth.
:::

**Simulator scenes**

```scene
id: l01-s1
version: 1
title: Find the bets
bankroll: 50000
allowedActions: []
showEV: false
steps:
  - id: player
    text: "Tap the **Player** spot."
    completeWhen: { tapped: player }
  - id: banker
    text: "Now **Banker**."
    completeWhen: { tapped: banker }
  - id: tie
    text: "And **Tie**: the bet that both hands end on the same total."
    completeWhen: { tapped: tie }
```

```scene
id: l01-s2
version: 1
title: Your first hand
bankroll: 50000
allowedBets: [player]
showEV: false
steps:
  - id: bet
    text: "Put **$10 on Player**: pick the $5 chip and tap the Player spot twice."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { betOnFelt: { bet: player, minAmount: 1000 } }
  - id: deal
    text: "Tap **Deal** and watch."
    deals:
      - { player: [Kh, 7d], banker: [5s, Qc, Ah] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Player has 7 (the king counts 0). Banker had 5, drew an ace and made 6. Seven beats six: **Player wins**, and your $10 bet won $10. Notice that you made no decisions after betting."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: In baccarat, what are "Player" and "Banker"?
  options: ["You and the casino", "The two hands you can bet on", "Two seats at the table", "Two dealers"]
  answer: 1
  explain: "They're just the names of the two hands. Anyone can bet on either."
- q: You bet $20 on Banker and it wins. What do you get paid?
  options: ["$20", "$19", "$18", "$160"]
  answer: 1
  explain: "Banker pays 1 to 1 less 5% commission: $20 − $1 = $19."
- q: When do you decide whether a hand takes a third card?
  options: ["After seeing the first two cards", "Before the deal", "Never: a fixed rule decides", "Only when you bet Player"]
  answer: 2
  explain: "The third-card rule is automatic. Your only choices are your bets."
```

---

### Lesson 2: `card-values`: Counting a hand: only the last digit

**Front matter:** `chapter: foundations` · `minutes: 4` · summary: "Tens are zero, and you drop the tens digit."

**Objectives**

* Give each card its baccarat value: A = 1, 2–9 face value, 10/J/Q/K = 0.
* Total a hand by keeping only the last digit.
* Know that the best possible total is 9, and that two cards worth 8 or 9 are called a **natural**.

**Lesson**

Baccarat totals are tiny. Every hand is worth **0 to 9**.

| Card | Value |
|---|---|
| Ace | 1 |
| 2 to 9 | Face value |
| 10, Jack, Queen, King | **0** |

To total a hand, add the cards and **keep only the last digit**:

* {{7h 2c}} = 9.
* {{9c 6d}} = 15 → **5**.
* {{Kd Jh}} = 0 + 0 = **0**. (Players call this "baccarat", the worst hand.)
* {{8s 8d}} = 16 → **6**.

You can never "bust" in baccarat, and a hand never goes above 9. A third card is added the same way:
{{9c 6d}} is 5, and a {{3h}} makes it 8.

A two-card total of **8 or 9** is a **natural**: the best start you can have. When either hand has a
natural, the hand is over at once. Nobody draws. The next lesson starts there.

**Simulator scenes**

```scene
id: l02-s1
version: 1
title: What's the total?
bankroll: 50000
bets: { player: 1000 }
showEV: false
steps:
  - id: total
    text: "Tap **Deal**. The deal stops after two cards each: what is the **Player** total?"
    deals:
      - { player: [9c, 6d, 3h], banker: [Kd, Jh, 7s] }
    pauseAt: two-cards
    predict: { kind: hand-total, side: player }
    allowedActions: [deal]
    hint: "9 + 6 = 15. Keep only the last digit."
    completeWhen: { predicted: { count: 1 } }
  - id: finish
    text: "It's **5** (9 + 6 = 15). Banker has 0 (two picture cards). Both hands draw. Player's {{3h}} makes 8 and Banker's {{7s}} makes 7. **Player wins 8 to 7**, and your $10 on Player won."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "What is {{8h 7c}} worth?"
  options: ["15", "5", "7", "1"]
  answer: 1
  explain: "8 + 7 = 15, and you keep the last digit: 5."
- q: "What is {{Qs 9d}} worth?"
  options: ["19", "9", "0", "10"]
  answer: 1
  explain: "The queen is 0, so the hand is 9: a natural."
- q: "A hand is {{6c 4h}} and draws {{Ks}}. What's the total?"
  options: ["0", "10", "20", "4"]
  answer: 0
  explain: "6 + 4 = 10, which is 0. Adding a king (0) keeps it at 0."
- q: Which two-card totals are naturals?
  options: ["9 only", "8 and 9", "7, 8 and 9", "Any pair"]
  answer: 1
  explain: "A natural is 8 or 9 on the first two cards. It ends the hand at once."
```

---

### Lesson 3: `naturals-and-player-rule`: Naturals, and when the Player draws

**Front matter:** `chapter: third-card-rule` · `minutes: 5` · summary: "8 or 9: everyone stops. Otherwise the Player draws on 0–5."

**Objectives**

* Know that a natural on **either** side ends the hand.
* Apply the Player's rule: **draw on 0–5, stand on 6–7**.
* Know that the Player always acts first.

**Lesson**

The third-card rule is the one thing in baccarat worth learning by heart. The dealer applies it for you,
but once you know it you can follow every hand, and you'll see why the bets are priced as they are. It
comes in three parts, one per lesson.

**Part 1: naturals.** After two cards each, look at both totals. If **either** hand has 8 or 9, both
hands stand and the higher total wins. A natural 9 beats a natural 8. Two equal naturals are a tie.
About a third of all hands (34.3%) end right here.

**Part 2: the Player's rule.** No natural? The **Player** goes first, and its rule is simple:

| Player's two-card total | Player |
|---|---|
| 0, 1, 2, 3, 4, 5 | **Draws** a third card |
| 6, 7 | **Stands** |
| 8, 9 | Natural: nobody draws |

That's it. The Player never looks at the Banker's cards. On 0–5 the Player draws, and on 6 or 7 it stands.
The Player draws in about half of all hands (50.3%).

Then it's the Banker's turn. The Banker's rule is a little more involved, and it gets the next two lessons.

```tableau
view: player
```

:::math How often each thing happens (8 decks, exact)
Natural on either side: 158222458/461223945 ≈ **34.30%** of hands.
Player draws a third card: 15479099/30748263 ≈ **50.34%**.
Banker draws a third card: 4136876519/9501213267 ≈ **43.54%**.
These are exact fractions over every possible order of cards in an 8-deck shoe.
:::

**Simulator scenes**

```scene
id: l03-s1
version: 1
title: A natural stops everything
bankroll: 50000
bets: { player: 1000 }
showEV: false
steps:
  - id: natural
    text: "Tap **Deal**. After two cards each: does the **Player** draw?"
    deals:
      - { player: [4s, 5d], banker: [Qh, 8c] }
    pauseAt: two-cards
    predict: { kind: player-draws }
    allowedActions: [deal]
    hint: "Look for an 8 or a 9 on either side: a natural means nobody draws, so the Player stands."
    completeWhen: { predicted: { count: 1 } }
  - id: result
    text: "Player has a natural 9 ({{4s 5d}}) and Banker a natural 8, so **both stand**. 9 beats 8: Player wins."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l03-s2
version: 1
title: Player draws or stands?
bankroll: 50000
bets: { player: 1000 }
showEV: false
steps:
  - id: draws
    text: "Tap **Deal**, add up the Player's two cards, and call it: does the Player **draw** or **stand**?"
    deals:
      - { player: [2h, 3c, 4d], banker: [Td, 7h] }
    pauseAt: two-cards
    predict: { kind: player-draws }
    allowedActions: [deal]
    hint: "The Player draws on 0 to 5."
    completeWhen: { predicted: { count: 1 } }
  - id: draws-result
    text: "Player had {{2h 3c}} = 5, so it **draws**. The {{4d}} makes 9. Banker's 7 stands (a Banker 7 always stands), and **Player wins 9 to 7**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: stands
    text: "New hand. Tap **Deal** and call the Player again."
    deals:
      - { player: [Qs, 6h], banker: [3d, 2s, 3c] }
    pauseAt: two-cards
    predict: { kind: player-draws }
    allowedActions: [deal]
    hint: "On 6 or 7 the Player stands."
    completeWhen: { predicted: { count: 1 } }
  - id: stands-result
    text: "Player had {{Qs 6h}} = 6, so it **stands**. The Banker had 5 and drew a {{3c}} to make 8. **Banker wins 8 to 6.** Why did the Banker draw? That's the next lesson."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player has {{Jc 7s}} (7) and Banker has {{4d 4h}} (8). What happens?"
  options: ["Player draws", "Banker draws", "Nobody draws: Banker has a natural", "Both draw"]
  answer: 2
  explain: "A natural on either side ends the hand. Banker's 8 beats Player's 7."
  hand: { player: [Jc, 7s], banker: [4d, 4h] }
- q: The Player's two cards total 5. What does the Player do?
  options: ["Draws", "Stands", "It depends on the Banker", "Chooses"]
  answer: 0
  explain: "The Player draws on 0 to 5, whatever the Banker holds (unless the Banker has a natural)."
- q: The Player's two cards total 6. What does the Player do?
  options: ["Draws", "Stands", "It depends on the Banker", "Chooses"]
  answer: 1
  explain: "6 and 7 stand."
- q: About how often does a hand end with a natural?
  options: ["1 in 10", "About 1 in 3", "About half the time", "2 in 3"]
  answer: 1
  explain: "34.3% of hands have a natural on at least one side."
```

---

### Lesson 4: `banker-when-player-stands`: The Banker's turn, part 1: when the Player stood

**Front matter:** `chapter: third-card-rule` · `minutes: 4` · summary: "If the Player stood, the Banker copies the Player's rule."

**Objectives**

* Know that the Banker acts **after** the Player.
* When the Player **stood** (6 or 7), apply the Banker's rule: **draw on 0–5, stand on 6–7**.
* Spot a two-card tie.

**Lesson**

Good news: half of the Banker's rule is something you already know.

**If the Player stood** (on 6 or 7, two cards), the Banker uses the **same rule as the Player**:

| Banker's two-card total (Player stood) | Banker |
|---|---|
| 0–5 | **Draws** |
| 6, 7 | **Stands** |

So when the Player stands on 7 and the Banker has 4, the Banker draws, trying to beat that 7. When both
stand on 6, the hand is a **tie**, and Tie bets win.

**If the Player drew** a third card, the Banker's choice depends on its own total **and on the card the
Player just drew**. That's the famous Banker table, and it's the next lesson.

One way to remember the order: **naturals first, then the Player, then the Banker**. The Banker always
acts last, and that's its advantage. It's the only hand that gets to see what the other one did.

**Simulator scenes**

```scene
id: l04-s1
version: 1
title: The Banker copies the Player's rule
bankroll: 50000
bets: { banker: 1000 }
showEV: false
steps:
  - id: banker-draws
    text: "Tap **Deal**. The Player will stand on 7. Look at the Banker's two cards: does the **Banker** draw?"
    deals:
      - { player: [7c, Kh], banker: [4h, Jd, 5c] }
    pauseAt: two-cards
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "The Player stood, so the Banker uses the Player's rule: draw on 0 to 5."
    completeWhen: { predicted: { count: 1 } }
  - id: result-1
    text: "Banker had {{4h Jd}} = 4, and the Player stood, so the Banker **draws**. The {{5c}} makes 9. **Banker wins 9 to 7**. Your Banker bet won $10 less 50¢ commission: **+$9.50**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: tie
    text: "Tap **Deal** again. The Player stands on 6. Does the **Banker** draw?"
    deals:
      - { player: [3s, 3h], banker: [6d, Ks] }
    pauseAt: two-cards
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "On 6 or 7, the Banker stands when the Player stood."
    completeWhen: { predicted: { count: 1 } }
  - id: result-2
    text: "Banker had {{6d Ks}} = 6, so it **stands**. Both on 6: a **tie**. Your Banker bet **pushes**: it comes back to you, with no win and no loss."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player stands on 7. Banker has 5. What does the Banker do?"
  options: ["Draws", "Stands", "Nothing, the Player won"]
  answer: 0
  explain: "When the Player stood, the Banker draws on 0 to 5."
- q: "Player stands on 6. Banker has 7. What happens?"
  options: ["Banker draws", "Banker stands and wins 7 to 6", "Tie"]
  answer: 1
  explain: "The Banker stands on 7, and 7 beats 6."
- q: Who acts last in every hand?
  options: ["The Player", "The Banker", "Whoever has the lower total", "The player with the biggest bet"]
  answer: 1
  explain: "The Banker always acts after the Player. That's where its small advantage comes from."
```

---

### Lesson 5: `banker-third-card-table`: The Banker's turn, part 2: the table

**Front matter:** `chapter: third-card-rule` · `minutes: 8` · summary: "When the Player drew, the Banker reads the Player's third card."

**Objectives**

* Apply the Banker's table when the Player drew a third card.
* Remember it with one pattern: **3 → all but 8, 4 → 2–7, 5 → 4–7, 6 → 6–7**.
* Know the two fixed rows: the Banker always draws on 0–2 and always stands on 7.

**Lesson**

This is the last piece. When the **Player drew** a third card, the Banker looks at its own two-card total
and at the **Player's third card** (not the Player's total):

| Banker has | Banker draws if the Player's third card is | Banker stands if it is |
|---|---|---|
| 0, 1, 2 | **anything** | — |
| 3 | anything **except 8** | 8 |
| 4 | **2 to 7** | 0, 1, 8, 9 |
| 5 | **4 to 7** | 0–3, 8, 9 |
| 6 | **6 or 7** | 0–5, 8, 9 |
| 7 | — | **always stands** |

A ten or a picture card drawn by the Player counts as **0**.

That looks like a lot, but there's a pattern. Read down the "draws if" column from Banker 4 to 6:
**2–7, 4–7, 6–7**. The top end is always **7**, and the bottom end climbs by two each row. Banker 3 is
the generous row: it draws on everything except an 8. Rows 0–2 always draw, and 7 always stands.

**Why does the Banker draw more against a 2–7?** A Player third card of 2–7 usually means the Player
improved to a middle total, so a Banker sitting on 3–6 needs help. A Player's 8, 9, 0 or 1 is a sign
the Player may have stayed low or gone backwards, so the Banker can afford to stand. The table was tuned
long ago so the Banker makes roughly the best play in each spot. That one advantage, acting last with
more information, is why the Banker wins more often (lesson 9).

```tableau
view: banker
```

:::math How the table plays out
Because the Banker sometimes stands on 3–6 and sometimes draws, it draws a little less often than the
Player: 43.5% of all hands, against the Player's 50.3%. A ten-value card is the most common third card
(16 of every 52 cards), and it counts as 0. That's why Banker 4 and 5 **stand** on a Player's 0: the
Player probably didn't improve.
:::

**Simulator scenes**

```scene
id: l05-s1
version: 1
title: One row at a time
bankroll: 50000
bets: { banker: 1000 }
showEV: false
steps:
  - id: b3-p8
    text: "Tap **Deal**. The deal pauses after the Player's third card. Banker has **3** here: does the Banker draw?"
    deals:
      - { player: [Ah, 2c, 8s], banker: [Jc, 3d] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 3 draws on anything **except an 8**."
    completeWhen: { predicted: { count: 1 } }
  - id: b3-result
    text: "The Player drew an **8**, so Banker 3 **stands**: 3 against an 8 is the one stand in that row. The Banker's 3 beats the Player's 1."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b4-p2
    text: "Tap **Deal**. This time the Banker has **4**. Watch the Player's third card, then call it."
    deals:
      - { player: [Kd, 4c, 2h], banker: [Qs, 4s, 3h] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 4 draws when the Player's third card is **2 to 7**."
    completeWhen: { predicted: { count: 1 } }
  - id: b4-result
    text: "The Player drew a **2**, so Banker 4 **draws**. The {{3h}} makes 7, and **Banker wins 7 to 6**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b5-p3
    text: "Tap **Deal**. Banker **5** this time. Call it after the Player's third card."
    deals:
      - { player: [5h, Tc, 3d], banker: [2d, 3s] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 5 draws only on a Player third card of **4 to 7**."
    completeWhen: { predicted: { count: 1 } }
  - id: b5-result
    text: "The Player drew a **3**, outside 4–7, so Banker 5 **stands**. Player's 8 wins. (Yes, the rule can leave the Banker standing on a loser. It's a fixed rule, not a choice.)"
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b6-p7
    text: "Tap **Deal**. Banker **6**. Call it after the Player's third card."
    deals:
      - { player: [Ks, Jh, 7c], banker: [4d, 2c, 2s] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 6 draws only on a Player third card of **6 or 7**."
    completeWhen: { predicted: { count: 1 } }
  - id: b6-result
    text: "The Player drew a **7**, so Banker 6 **draws**. The {{2s}} makes 8, and **Banker wins 8 to 7**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b6-p5
    text: "Last one. Tap **Deal**. Banker **6** again. Call it."
    deals:
      - { player: [Qd, 2s, 5s], banker: [3h, 3c] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 6 draws only on a 6 or a 7."
    completeWhen: { predicted: { count: 1 } }
  - id: b6-p5-result
    text: "The Player drew a **5**, so Banker 6 **stands**. **Player wins 7 to 6.** You now know the whole rule."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "The Player drew a 9. The Banker has 3. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 3 draws on everything except an 8."
- q: "The Player drew a 1. The Banker has 4. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "Banker 4 draws only on 2 to 7."
- q: "The Player drew a 6. The Banker has 6. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 6 draws on a Player third card of 6 or 7."
- q: "The Player drew a queen. The Banker has 5. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "A queen counts 0. Banker 5 draws only on 4 to 7."
```

---

### Lesson 6: `third-card-practice`: Calling the hand like a dealer

**Front matter:** `chapter: third-card-rule` · `minutes: 6` · summary: "Mixed practice, then meet the Drill tab."

**Objectives**

* Call any hand in order: naturals → Player → Banker.
* Get five calls in a row right on random hands.
* Know where to keep practising: the **Drill** tab.

**Lesson**

Here's the whole rule as a checklist. Dealers run through it in their heads on every hand:

1. **Natural?** If either side has 8 or 9 on two cards, stop. Higher total wins.
2. **Player:** 0–5 draws, 6–7 stands.
3. **Banker, if the Player stood:** 0–5 draws, 6–7 stands.
4. **Banker, if the Player drew:** use the Player's **third card**:
   0–2 always draw · 3 all but 8 · 4 on 2–7 · 5 on 4–7 · 6 on 6–7 · 7 stands.

```tableau
view: full
```

You don't need to be fast. At a real table the dealer does all of this for you, and a dealer who
makes a mistake is corrected by the supervisor. But being able to follow along means no hand ever
looks like magic, and nobody can fool you about what "should" have happened.

The **Drill** tab is a quick-fire trainer for exactly this: it deals a hand, stops, and asks
"Does the Banker draw?" (and other questions), then shows the rule row that decides it. Try a few
rounds of **Banker table** until it feels easy.

**Simulator scenes**

```scene
id: l06-s1
version: 1
title: Five in a row
bankroll: 50000
bets: { banker: 1000 }
seed: 6
showEV: false
onDealsExhausted: random
steps:
  - id: player-calls
    text: "Random hands now. Tap **Deal** and call the **Player**: Draw or Stand? Get three right. (Hands with a natural are skipped.)"
    predict: { kind: player-draws }
    allowedActions: [deal]
    pauseAt: two-cards
    skipNaturals: true
    hint: "Player: 0 to 5 draws, 6 and 7 stand."
    completeWhen: { predicted: { correct: true, count: 3 } }
  - id: banker-calls
    text: "Now the **Banker**. Tap **Deal**; the deal pauses after the Player's turn. Get five right."
    predict: { kind: banker-draws }
    allowedActions: [deal]
    pauseAt: player-third
    skipNaturals: true
    hint: "If the Player stood: 0 to 5 draws. If the Player drew: 3 all but 8, 4 on 2–7, 5 on 4–7, 6 on 6–7."
    completeWhen: { predicted: { correct: true, count: 5 } }
  - id: done
    text: "That's the whole third-card rule. Keep it sharp in **Drill**."
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player {{9s 7h}}, Banker {{Ac 5d}}. What happens first?"
  hand: { player: [9s, 7h], banker: [Ac, 5d] }
  options: ["Player draws", "Player stands on 6", "Banker draws", "Natural"]
  answer: 1
  explain: "9 + 7 = 16 → 6. Player stands, so the Banker's 6 also stands: a tie."
- q: "Player {{4c Kd}} draws a {{7s}}. Banker has {{5h Qc}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 5 draws on a Player third card of 4 to 7. A 7 is in range."
- q: "Player {{2c 2d}} draws an {{8h}}. Banker has {{Jd 3s}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "Banker 3 stands only on an 8, and this is that case."
- q: "Player {{Ah Ts}} draws a {{4c}}. Banker has {{7c Kc}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "Banker 7 always stands."
```

---

### Lesson 7: `settling-bets`: Who gets paid: commission, ties and pushes

**Front matter:** `chapter: ev-basics` · `minutes: 5` · summary: "Banker pays 95¢ on the dollar, ties push, and Tie pays 8 to 1."

**Objectives**

* Settle Player, Banker and Tie bets for each result.
* Work out the 5% commission on any Banker win.
* Know that Player and Banker bets **push** on a tie.

**Lesson**

Every hand ends one of three ways: Player wins, Banker wins, or a tie. Here is what happens to each bet:

| Result | Player bet | Banker bet | Tie bet |
|---|---|---|---|
| Player wins | **Wins 1:1** | Loses | Loses |
| Banker wins | Loses | **Wins 1:1 less 5%** | Loses |
| Tie | **Push** (returned) | **Push** (returned) | **Wins 8:1** |

**Commission.** A winning Banker bet pays 95¢ for each dollar: the casino keeps 5% of the win.

| Banker bet | Win before commission | Commission (5%) | You're paid |
|---|---|---|---|
| $10 | $10 | $0.50 | **$9.50** |
| $20 | $20 | $1.00 | **$19.00** |
| $25 | $25 | $1.25 | **$23.75** |
| $100 | $100 | $5.00 | **$95.00** |

The commission is only charged on **wins**. A losing Banker bet loses the bet and nothing more, and a
push costs nothing.

**Ties.** A tie isn't a loss for Player or Banker bets. The chips just stay where they are. That's
why many players don't mind ties at all. The **Tie** bet is the one that wins: 8 to 1, so a $5 Tie bet
wins $40 and you keep the $5.

:::tip
In this app the commission comes out of each Banker win as it's paid. At many real tables it doesn't:
the dealer pays the full amount and drops a marker in a numbered **commission box** for your seat.
You settle it when you leave or when the shoe ends (lesson 23).
:::

**Simulator scenes**

```scene
id: l07-s1
version: 1
title: Paying the commission
bankroll: 50000
allowedBets: [banker]
showEV: false
steps:
  - id: bet
    text: "Put **$20 on Banker**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { betOnFelt: { bet: banker, minAmount: 2000 } }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [2d, Kh, Jc], banker: [7s, Qd] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Player had 2 and drew a jack: still 2. Banker's 7 stands. **Banker wins**: $20 less $1 commission, so you won **$19**. Tap the payout to see the commission line."
    allowedActions: []
    completeWhen: { tapped: commission }
```

```scene
id: l07-s2
version: 1
title: A tie
bankroll: 50000
allowedBets: [player, tie]
showEV: false
steps:
  - id: bet
    text: "Bet **$10 on Player** and **$5 on Tie**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: player, minAmount: 1000 } }, { betOnFelt: { bet: tie, minAmount: 500 } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Kc, 6s], banker: [2h, 4h] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Six all: a **tie**. Your $10 Player bet pushes and comes back. Your $5 Tie bet wins 8 to 1: **+$40**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: You bet $50 on Banker and Banker wins. How much do you win?
  options: ["$50", "$47.50", "$45", "$52.50"]
  answer: 1
  explain: "5% of $50 is $2.50, so the win is $47.50."
- q: You bet $10 on Player and the hand is a tie. What happens?
  options: ["You lose $10", "You win $80", "Your $10 comes back", "You lose $0.50"]
  answer: 2
  explain: "Player and Banker bets push on a tie."
- q: You bet $10 on Banker and Player wins. How much commission do you pay?
  options: ["$0.50", "Nothing: commission is only on wins", "$10.50", "$1"]
  answer: 1
  explain: "You lose the $10 bet. Commission is only charged on Banker wins."
- q: A $5 Tie bet wins. How much do you win?
  options: ["$5", "$40", "$45", "$8"]
  answer: 1
  explain: "8 to 1: 8 × $5 = $40, and your $5 comes back too."
```

---

### Lesson 8: `expected-value`: EV and the house edge, in plain English

**Front matter:** `chapter: ev-basics` · `minutes: 7` · summary: "What a bet is worth on average, and how the EV sheet shows it."

**Objectives**

* Explain **expected value (EV)** as the average result of a bet over many hands.
* Read the **house edge** as "cents lost per dollar bet, on average".
* Open the **EV sheet** for any bet before placing it.

**Lesson**

No single hand of baccarat is predictable, but a thousand hands are. **Expected value** is what a bet
returns **on average** if you could repeat the same bet forever. You get it by weighing each result by how
often it happens.

Take $10 on **Player**. In an 8-deck shoe, the Player wins 44.62% of hands, the Banker wins 45.86%, and
9.52% are ties:

* win $10 × 44.62% = +$4.46
* lose $10 × 45.86% = −$4.59
* push $0 × 9.52% = $0

Total: **−$0.12**. On average, a $10 Player bet costs about 12 cents. That −1.24% is the
**house edge**: the share of each bet the casino keeps on average.

The house edge doesn't mean you lose 12 cents every hand. You win $10 or lose $10 (or push), and
over a few hands you can be well up or well down. What it means is that the average drifts toward
−12 cents a hand, and over thousands of hands the drift is all that's left.

**The EV sheet.** Tap and hold any bet spot (or tap the **EV** button by it) before you bet. The sheet shows:

* the bet's **EV in dollars** for the chips you're about to place, and its **house edge**;
* its **rating**: Good bet, Fair, Poor bet or Sucker bet, always written out, never shown by colour alone;
* what it costs **per hour** at 72 hands an hour;
* a better choice, if there is one on this table.

From now on the EV sheet is switched on in every lesson.

:::math The three EVs, exactly (8 decks, per $1)
P(Player wins) = 8712962041376/19524993263685 ≈ 0.446247
P(Banker wins) = 8954111587648/19524993263685 ≈ 0.458597
P(Tie) = 619306544887/6508331087895 ≈ 0.095156

EV(Player) = P(Player) − P(Banker) = −241149546272/19524993263685 ≈ **−1.2351%**
EV(Banker) = 0.95 × P(Banker) − P(Player) = −114753351728/10847218479825 ≈ **−1.0579%**
EV(Tie) = 8 × P(Tie) − (1 − P(Tie)) = −103841353768/723147898655 ≈ **−14.3596%**

They come from every possible order of cards in a full 8-deck shoe (4,998,398,275,503,360 ordered deals of
up to six cards), dealt by the exact tableau.
:::

**Simulator scenes**

```scene
id: l08-s1
version: 1
title: Open the EV sheet
bankroll: 50000
allowedBets: [player, banker, tie]
showEV: true
steps:
  - id: player
    text: "Open the EV sheet for a **$10 Player** bet."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { previewed: { bet: player } }
  - id: banker
    text: "About **−$0.12**: 1.24% of the bet. Now open **Banker**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { previewed: { bet: banker } }
  - id: tie
    text: "Banker is a little cheaper: about **−$0.11**, 1.06%. Now **Tie**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { previewed: { bet: tie } }
  - id: summary
    text: "Tie costs **$1.44** per $10 bet: over 13 times as much as Banker. Same table, same cards, very different prices."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: What does a house edge of 1.06% mean?
  options: ["You lose 1.06% of hands", "On average you lose about 1.06¢ per $1 bet", "The casino wins 1.06% more hands", "You'll lose exactly $1.06 per $100 tonight"]
  answer: 1
  explain: "It's an average cost per dollar bet, not a promise about any one session."
- q: Roughly what is the EV of a $10 Player bet?
  options: ["−$1.24", "−$0.12", "+$0.12", "$0"]
  answer: 1
  explain: "1.24% of $10 is about 12 cents."
- q: Which bet does the EV sheet rate cheapest on a standard table?
  options: ["Player", "Banker", "Tie", "They're all the same"]
  answer: 1
  explain: "Banker: 1.06%. Player: 1.24%. Tie: 14.36%."
```

---

### Lesson 9: `banker-vs-player`: Why the Banker wins more often

**Front matter:** `chapter: ev-basics` · `minutes: 6` · summary: "Acting last is worth 1.24%, and the commission takes it back and a bit more."

**Objectives**

* Know that the Banker wins **45.86%** of hands and the Player **44.62%**.
* Explain the advantage: the Banker acts last, with a rule tuned to the Player's third card.
* Know why the commission exists, and that Banker is **still** the cheaper bet after paying it.

**Lesson**

The two hands aren't treated equally. The Player follows a blind rule (0–5 draws). The Banker acts
**after** seeing what the Player did, and in lesson 5 you saw how its table reacts to the Player's third
card. That small information edge means the Banker wins a bit more often:

| Result | How often (8 decks) |
|---|---|
| Banker wins | **45.86%** |
| Player wins | **44.62%** |
| Tie | 9.52% |

Leave out the ties, and the Banker wins **50.68%** of the hands that are decided.

If Banker paid even money, it would be a **winning** bet for you: +1.24%, exactly the mirror of the Player
bet's −1.24%. Casinos fix that with the **5% commission**. A Banker win then pays 95¢, and the bet
goes from +1.24% to **−1.06%**.

So both bets lose in the long run, but the Banker bet loses **less**: about 1.06¢ per dollar against
1.24¢. Paying the commission feels like a cost, and it is, but it's smaller than the price of betting
on the hand that wins less often.

:::math Where the commission sits
With the commission c, EV(Banker) = (1 − c) × P(Banker) − P(Player).
At c = 0: +241149546272/19524993263685 ≈ +1.2351% (exactly minus EV(Player)).
At c = 5%: −1.0579%.
The bet breaks even at c = 1 − P(Player)/P(Banker) = 7535923321/279815987114 ≈ **2.69%**. Some casinos
charge 4%, which gives an edge of 2925372930848/488124831592125 ≈ **0.5993%** (lesson 12).
:::

**Simulator scenes**

```scene
id: l09-s1
version: 1
title: Same cards, two bets
bankroll: 1000000
showEV: true
ui: { speed: fast, showSession: true }
autoPlay:
  enabled: true
  handOptions: [720]
  sessions: [1]
  compare:
    - { id: flat-banker, unit: 1000 }
    - { id: flat-player, unit: 1000 }
steps:
  - id: run
    text: "Auto-play **720 hands** (10 hours) twice on the same cards: $10 on Banker every hand, then $10 on Player. Tap **Run**."
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "Count the wins: Banker usually wins a few more hands than Player. The expected lines end at about **−$76** for Banker and **−$89** for Player. Over 720 hands, luck still moves each result by about ±$250, so your run may look different."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Why does the Banker win more often than the Player?
  options: ["The dealer favours it", "It acts last, with a rule that reacts to the Player's third card", "It gets an extra card", "It doesn't: they win equally"]
  answer: 1
  explain: "The Banker's rule uses the information from the Player's draw."
- q: Without commission, what would the Banker bet's edge be?
  options: ["The house would still have 1.06%", "Zero", "About 1.24% in your favour", "About 5% in your favour"]
  answer: 2
  explain: "Banker at even money would be the exact mirror of Player: +1.24% for you."
- q: After commission, which bet costs less?
  options: ["Player", "Banker", "They're equal"]
  answer: 1
  explain: "Banker 1.06% vs Player 1.24%."
```

---

### Lesson 10: `the-tie-bet`: The Tie bet: 8 to 1 isn't enough

**Front matter:** `chapter: ev-basics` · `minutes: 5` · summary: "Ties come about 1 hand in 10.5, so 8 to 1 is short."

**Objectives**

* Know that a tie happens about **once in 10.5 hands**.
* Explain why paying 8 to 1 gives a **14.36%** house edge.
* Compare with 9 to 1 tables (4.84%).

**Lesson**

Ties feel common, and they are: about **9.5%** of hands, roughly one in every 10.5. So why is the Tie bet
the worst of the three?

Picture 1,000 hands with $1 on Tie each time. About 95 are ties, and each pays $8: $761 in winnings. The
other 905 lose $1 each: −$905. Net: about **−$144** per 1,000 hands, or **14.36%** of every Tie bet.

For a fair bet, a tie would have to pay about **9.5 to 1**. At 8 to 1 the casino keeps the difference.
Some casinos pay **9 to 1** on ties. That cuts the edge to **4.84%**: much better, but still more
than four times the Banker bet.

| Tie pays | House edge | Cost per hour at $10, 72 hands/hour |
|---|---|---|
| 8 to 1 (default) | 14.36% | **$103.39** |
| 9 to 1 | 4.84% | $34.88 |
| (Banker, for comparison) | 1.06% | $7.62 |

A Tie bet also swings hard. It loses about 9 hands out of 10, then pays big. That's part of its
appeal, and lesson 22 prices that fun honestly.

:::math Tie, exactly
P(Tie) = 619306544887/6508331087895 ≈ 0.0951560, about 1 in 10.51.
8:1: EV = 9 × P(Tie) − 1 = −103841353768/723147898655 ≈ **−14.3596%**.
9:1: EV = 10 × P(Tie) − 1 = −63053127805/1301666217579 ≈ **−4.8440%**.
Break-even payout: 1/P(Tie) − 1 ≈ 9.509 to 1.
:::

**Simulator scenes**

```scene
id: l10-s1
version: 1
title: An evening on the Tie
bankroll: 1000000
showEV: true
ui: { speed: fast, showSession: true }
autoPlay:
  enabled: true
  handOptions: [720]
  sessions: [100]
  compare:
    - { id: flat-tie, unit: 1000 }
    - { id: flat-banker, unit: 1000 }
steps:
  - id: run
    text: "Run **100 evenings of 10 hours** (720 hands each) with $10 on Tie every hand, and the same with $10 on Banker. Tap **Run**."
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "Look at the middle of each band. The Banker evenings centre near **−$76**, and the Tie evenings near **−$1,034**. A few Tie evenings still finish ahead: lucky runs of ties happen, but they're the exception."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: About how often is a hand a tie?
  options: ["1 in 3", "1 in 10.5", "1 in 20", "1 in 100"]
  answer: 1
  explain: "9.52% of hands, about 1 in 10.5."
- q: What payout would make the Tie bet fair?
  options: ["8 to 1", "About 9.5 to 1", "10 to 1 exactly", "11 to 1"]
  answer: 1
  explain: "1 ÷ 0.0952 − 1 ≈ 9.51."
- q: Your casino pays 9 to 1 on ties. What's the edge?
  options: ["14.36%", "4.84%", "1.06%", "0%"]
  answer: 1
  explain: "Much better than 8 to 1, but still over four times the Banker bet."
- q: At $10 a hand and 72 hands an hour, what does an 8 to 1 Tie bet cost per hour on average?
  options: ["About $7.62", "About $34.88", "About $103", "About $14"]
  answer: 2
  explain: "72 × $10 × 14.36% ≈ $103.39."
```

---

### Lesson 11: `strategy-lowest-edge`: Perfect strategy I: the lowest edge

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 5` · summary: "Bet Banker, flat, every hand. That's the whole optimum."

**Objectives**

* State the lowest-edge strategy: **bet Banker every hand, and skip the side bets**.
* Know that bet timing, streaks and the Player/Banker switch don't change the edge of a full shoe.
* Rank every bet on the default table.

**Lesson**

Here's the good news: perfect baccarat strategy fits on a sticky note.

> **Bet Banker. Every hand. No side bets.**

Every bet on the table has a fixed price. Nothing you do after betting can change it, because there
are no decisions. "Strategy" is just picking the cheapest bet, and that's Banker:

| Bet (default table) | House edge | Rating | $10 for an hour (72 hands) |
|---|---|---|---|
| **Banker** | **1.06%** | Good bet · lowest on this table | **$7.62** |
| Player | 1.24% | Good bet | $8.89 |
| Dragon Bonus on Player | 2.65% | Fair | $19.09 |
| Dragon Bonus on Banker | 9.37% | Sucker bet | $67.49 |
| Player Pair / Banker Pair | 10.36% | Sucker bet | $74.60 |
| Tie 8:1 | 14.36% | Sucker bet | $103.39 |

Two things often sold as strategy make **no** difference to the edge:

* **When you bet.** Every hand of a fresh shoe costs the same per dollar. Skipping hands only means you play
  fewer of them. That cuts your **hourly** cost (lesson 14), but not your edge per bet.
* **Switching sides.** Mixing Player and Banker gives you a blend of 1.06% and 1.24%. Any Player bet just
  costs a little more than the same Banker bet would.

The Banker-vs-Player difference is small: at $10 a hand it's $1.27 an hour. If you prefer Player
for some reason, that's not a disaster. But Tie and most side bets cost **ten times** as much, and that's
where the real money goes. Lesson 17 covers card counting: the one way the edge can move, and why it
almost never helps.

**Simulator scenes**

```scene
id: l11-s1
version: 1
title: Pick the cheapest bet
bankroll: 50000
allowedBets: [player, banker, tie, player-pair, banker-pair, dragon-bonus-player, dragon-bonus-banker]
showEV: true
steps:
  - id: compare
    text: "Open the EV sheet on **Player**, **Banker** and **Tie**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { previewed: { bet: player } }, { previewed: { bet: banker } }, { previewed: { bet: tie } } ] }
  - id: bet
    text: "Now place the **lowest-edge bet**: $10 where the sheet shows the smallest house edge."
    allowedActions: [set-bet, clear-bets]
    expect: [ { type: set-bet, bet: banker } ]
    hint: "Banker: 1.06%, the lowest on this table."
    completeWhen: { betOnFelt: { bet: banker, minAmount: 1000 } }
  - id: play
    text: "Deal **five hands** with the same bet (**Rebet & Deal** repeats it). Some will win, some will lose, and the price never changes."
    allowedActions: [deal, rebet]
    allowedBets: [banker]
    completeWhen: { hands: 5 }
```

```quiz
- q: What is the lowest-edge strategy at a standard baccarat table?
  options: ["Follow the streaks", "Bet Banker every hand", "Alternate Player and Banker", "Bet Tie after a long gap"]
  answer: 1
  explain: "Banker has the lowest edge, and nothing else changes the price of a hand."
- q: You sit out ten hands, then bet. What happens to the house edge on your bet?
  options: ["It goes down", "It goes up", "It stays the same", "It depends on the streak"]
  answer: 2
  explain: "Per bet it's the same 1.06%. Sitting out only lowers your cost per hour."
- q: "Which costs more per hour at $10: Player instead of Banker, or Tie instead of Banker?"
  options: ["Player instead of Banker", "Tie instead of Banker", "They cost the same"]
  answer: 1
  explain: "Player costs $1.27 an hour more than Banker; Tie costs $95.77 more."
```

---

### Lesson 12: `table-variants`: Choosing a table: commission, EZ and Super 6

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 7` · summary: "No-commission tables, 4% tables, 6 decks and 9:1 ties: which is cheapest."

**Objectives**

* Explain how **EZ Baccarat** and **Super 6** remove the commission, and what they take back.
* Rank the common table variants by Banker edge.
* Know that the Player bet is the same at all of them.

**Lesson**

Many casinos now advertise **no-commission** baccarat. There's no free lunch: each version takes
the 5% back in a different way.

**EZ Baccarat** (`ez`). Banker wins pay **1:1**, except when the Banker wins with a **three-card 7**
(the "Dragon 7"). Then the Banker bet **pushes**. That happens about once every 44 hands. The Banker edge
is **1.02%**, a hair **better** than the commission game's 1.06%. EZ tables also offer two famous side
bets, Dragon 7 and Panda 8 (lesson 21).

**Super 6 / Punto 2000** (`super-6`). Banker wins pay **1:1**, except when the Banker wins with a total of
**6**. Then it pays only **half** (1 to 2). That happens about once every 19 hands, and it costs more than
it looks: the Banker edge is **1.46%**, worse than both the commission game and the Player bet.

Every option, cheapest first (8 decks unless noted):

| Table | Banker edge | Player edge | Banker, $10 for an hour |
|---|---|---|---|
| 4% commission (rare) | 0.60% | 1.24% | $4.31 |
| EZ Baccarat | **1.02%** | 1.24% | $7.33 |
| 6 decks, 5% commission | 1.06% (1.0558%) | 1.24% (1.2374%) | $7.60 |
| **8 decks, 5% commission (default)** | **1.06%** (1.0579%) | 1.24% (1.2351%) | **$7.62** |
| Super 6 | 1.46% | 1.24% | $10.50 |

At a **Super 6** table, Player (1.24%) is the cheapest main bet. Everywhere else it's Banker. The number of
decks barely matters for the main bets. It matters more for Pairs (lesson 20).

Also check the **Tie**: 9 to 1 (4.84%) instead of 8 to 1 (14.36%) is a big improvement if you like the bet.

:::math EZ and Super 6, exactly (8 decks)
P(Banker wins with a three-card 7) = 19129247848/848912750595 ≈ 2.2534% (1 in 44.4).
EZ Banker: EV = P(Banker) − P(Dragon 7) − P(Player) = −66274384744/6508331087895 ≈ **−1.0183%**.
P(Banker wins with a 6) = 210337737856/3904998652737 ≈ 5.3864% (1 in 18.6).
Super 6 Banker: EV = P(Banker) − ½ × P(Banker wins with 6) − P(Player) = −284694798368/19524993263685 ≈ **−1.4581%**.
:::

**Simulator scenes**

```scene
id: l12-s1
version: 1
title: EZ Baccarat's Dragon 7
variant: ez
bankroll: 50000
allowedBets: [banker]
showEV: true
steps:
  - id: bet
    text: "This is an **EZ Baccarat** table. Put **$10 on Banker** and open its EV sheet: 1.02%, no commission."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: banker, minAmount: 1000 } }, { previewed: { bet: banker } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Kc, 5d, Th], banker: [Ad, 2h, 4c] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Banker won 7 to 5 **with three cards**: a Dragon 7. In EZ that win **pushes**, so your $10 comes back and nothing more."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l12-s2
version: 1
title: Super 6
variant: super-6
bankroll: 50000
allowedBets: [banker]
showEV: true
steps:
  - id: bet
    text: "A **Super 6** table. Put **$10 on Banker** and open its EV sheet: **1.46%**, more than the Player bet here."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: banker, minAmount: 1000 } }, { previewed: { bet: banker } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Qh, 4d, Kh], banker: [3c, 3s] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Banker wins **6** to 4. At Super 6 that pays half: **+$5** instead of $10."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: At an EZ Baccarat table, what happens when Banker wins with a three-card 7?
  options: ["Banker pays 40 to 1", "Banker bets push", "Banker pays half", "Banker bets lose"]
  answer: 1
  explain: "That's the trade-off for paying 1:1 without commission."
- q: Which table gives the Banker bet the highest edge?
  options: ["EZ Baccarat", "8 decks, 5% commission", "Super 6", "4% commission"]
  answer: 2
  explain: "Super 6: 1.46%, worse than the Player bet's 1.24%."
- q: At a Super 6 table, what's the lowest-edge main bet?
  options: ["Banker", "Player", "Tie"]
  answer: 1
  explain: "Player is 1.24% everywhere, and Super 6 Banker is 1.46%."
- q: Does a 6-deck shoe change the Banker edge much?
  options: ["Yes, it halves it", "No: 1.0558% vs 1.0579%", "Yes, it doubles it", "Banker can't be played with 6 decks"]
  answer: 1
  explain: "The number of decks hardly matters for the main bets."
```

---

### Lesson 13: `checkpoint-strategy` ✔: Checkpoint: rules and the best bet

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 8` · `checkpoint: true` · summary: "The third-card rule and the lowest-edge bet, all together."

**Objectives**

* Call the third-card rule without help.
* Pick the lowest-edge bet at each table type.
* Settle bets including commission and pushes.

**Lesson**

A quick check before the practical chapter. The first scene deals three hands and stops at each Banker
decision for you to call. The second puts you at a table you haven't played yet: place the lowest-edge bet. The quiz mixes everything from
lessons 1–12.

:::math Two ways to quote the same edge
You may see the Banker edge quoted as **1.17%** and Player as **1.36%**. Those figures leave ties out: they
are the loss per bet that was **decided** (won or lost). This app counts every hand you bet, ties
included as pushes, which gives 1.06% and 1.24%. That's the figure that turns straight into money per hand.
Per resolved bet: Banker 21516253449/1840320169690 ≈ 1.1692%, Player 7535923321/552096050907 ≈ 1.3650%.
:::

**Simulator scenes**

```scene
id: l13-s1
version: 1
title: Checkpoint
bankroll: 50000
bets: { banker: 1000 }
seed: 13
showEV: true
onDealsExhausted: random
steps:
  - id: calls
    text: "Tap **Deal** for random hands, and call whether the **Banker** draws. Get three right."
    allowedActions: [deal]
    predict: { kind: banker-draws }
    allowedActions: [deal]
    pauseAt: player-third
    skipNaturals: true
    hint: "Player stood: 0–5 draws. Player drew: 3 all but 8, 4 on 2–7, 5 on 4–7, 6 on 6–7."
    completeWhen: { predicted: { correct: true, count: 3 } }
```

```scene
id: l13-s2
version: 1
title: A new table
variant: super-6
bankroll: 50000
showEV: true
steps:
  - id: switch
    text: "A **Super 6** table. Place **$10 on the lowest-edge main bet**."
    allowedActions: [set-bet, clear-bets]
    allowedBets: [player, banker, tie]
    expect: [ { type: set-bet, bet: player } ]
    hint: "At Super 6, Banker is 1.46% and Player 1.24%."
    completeWhen: { betOnFelt: { bet: player, minAmount: 1000 } }
```

```quiz
- q: "Player {{5c Kd}} draws a {{4s}}. Banker has {{6h 9c}}. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker has 5 (6 + 9 = 15). Banker 5 draws on a Player third card of 4 to 7, and a 4 is in range."
- q: You bet $40 on Banker at a 5% commission table and win. What are you paid?
  options: ["$40", "$38", "$36", "$42"]
  answer: 1
  explain: "$40 less $2 commission."
- q: Which table offers the cheapest Banker bet of these?
  options: ["Super 6", "EZ Baccarat", "8 decks, 5% commission", "They're identical"]
  answer: 1
  explain: "EZ 1.02% < standard 1.06% < Super 6 1.46%."
- q: "Banker 6, and the Player stood on 7. What happens?"
  options: ["Banker draws", "Banker stands and loses 7 to 6", "Tie"]
  answer: 1
  explain: "When the Player stood, the Banker stands on 6 and 7."
- q: Why is the Tie bet a poor choice at 8 to 1?
  options: ["Ties are rare", "It pays less than the fair 9.5 to 1", "It's not allowed with Banker bets", "It has a commission"]
  answer: 1
  explain: "Ties come about 1 in 10.5, so 8 to 1 leaves a 14.36% edge."
```

---

### Lesson 14: `edge-and-hourly-cost`: House edge, per hand and per hour

**Front matter:** `chapter: perfect-practical` · `minutes: 6` · summary: "Edge × bet × hands per hour: the number that matters to your wallet."

**Objectives**

* Turn a house edge into an expected cost **per hand** and **per hour**.
* Know the app's assumption: **72 hands an hour**.
* See that bet size and pace move your cost far more than Banker vs Player.

**Lesson**

The house edge is a percentage. Your wallet cares about dollars. The conversion is one line:

> **Expected cost per hour = hands per hour × bet × house edge**

A mini-baccarat table deals about **72 hands an hour**, and every hourly figure in this app uses that
number. You can change it in Settings. At 72 hands:

| Banker bet | Per hand | Per hour | Money you push across the felt per hour |
|---|---|---|---|
| $5 | $0.05 | $3.81 | $360 |
| $10 | $0.11 | **$7.62** | $720 |
| $25 | $0.26 | $19.04 | $1,800 |
| $100 | $1.06 | $76.17 | $7,200 |

Two things stand out:

* **Bet size dominates.** Going from $10 to $25 costs $11.42 more an hour. Switching from Banker to Player
  at $10 costs $1.27.
* **Pace matters.** A big table with the squeeze (lesson 23) deals about 40 hands an hour. The same $10
  Banker bet then costs $4.23 an hour. Sitting out hands, chatting and taking breaks all lower the
  hourly cost without changing the edge.

Your edge per bet is the same either way. What changes is how many bets you make.

**One number, defined.** "House edge" in this app always means **expected loss per bet, counting ties as
pushes**. Some books quote the edge "ties excluded" (Banker 1.17%, Player 1.36%), which is the loss per
**decided** bet. Both are correct, but only the first one multiplies straight into dollars per hand. (In
some games there's also an "element of risk" when you can add money mid-hand. Baccarat has no such
bets, so here it equals the house edge.)

**Simulator scenes**

```scene
id: l14-s1
version: 1
title: Watch the meter
bankroll: 100000
showEV: true
ui: { showSession: true }
steps:
  - id: bet
    text: "Put **$25 on Banker** and open its EV sheet: expected **−$0.26** a hand, **−$19.04** an hour."
    allowedActions: [set-bet, clear-bets]
    allowedBets: [banker]
    completeWhen: { all: [ { betOnFelt: { bet: banker, minAmount: 2500 } }, { previewed: { bet: banker } } ] }
  - id: play
    text: "Deal **ten hands** (**Rebet & Deal** repeats the bet). Keep an eye on the session panel: **Expected** creeps down by about 26 cents a hand, while **Actual** jumps around."
    allowedActions: [deal, rebet]
    allowedBets: [banker]
    completeWhen: { hands: 10 }
  - id: panel
    text: "Tap the **session panel**. The gap between Actual and Expected is **luck**. Over ten hands it's usually far bigger than the edge."
    allowedActions: []
    completeWhen: { tapped: session }
```

```quiz
- q: Banker, $20 a hand, 72 hands an hour. Expected cost per hour?
  options: ["About $1.52", "About $15.23", "About $21", "About $152"]
  answer: 1
  explain: "72 × $20 × 1.0579% ≈ $15.23."
- q: Which change saves more per hour at a $10 Banker bet?
  options: ["Switching to Player", "Playing 40 hands an hour instead of 72", "Neither changes anything"]
  answer: 1
  explain: "Switching to Player costs $1.27 more. Slowing to 40 hands saves $3.39."
- q: A book says Banker's edge is 1.17%. The app says 1.06%. Who's right?
  options: ["The book", "The app", "Both: the book leaves ties out", "Neither"]
  answer: 2
  explain: "1.17% is per decided bet. 1.06% counts ties as pushes, per bet placed."
```

---

### Lesson 15: `variance-and-bankroll`: Swings, sessions and bankroll

**Front matter:** `chapter: perfect-practical` · `minutes: 8` · summary: "In an hour, luck is ten times bigger than the edge."

**Objectives**

* Know the **standard deviation** of each bet per hand.
* Size a session bankroll from your bet and how long you'll play.
* Run many sessions with auto-play and read the band and the survival curve.

**Lesson**

In the short run, baccarat is all luck. A $10 Banker bet loses about 11 cents on average, but each hand
actually moves you about **$9.27 up or down** (one standard deviation). Over an hour (72 hands):

| $10 Banker, flat | Expected | Typical swing (±1 SD) | Chance to be ahead (≈ approx.) |
|---|---|---|---|
| 1 hour | −$7.62 | ±$79 | 46% |
| 10 hours | −$76 | ±$249 | 38% |
| 100 hours | −$762 | ±$787 | 17% |

Luck grows with the **square root** of the number of hands, and the edge grows in a straight line. So
luck dominates a night out, and the edge dominates a lifetime.

Some bets swing much harder than others (SD per $1 bet, per hand): Banker 0.93, Player 0.95,
Dragon Bonus on Player 2.47, Tie 2.64, Pair 3.42, Dragon 7 6.08. Hard swingers give you more big
wins **and** more busted sessions, at a much higher average cost.

**How much to bring.** Here's the chance that flat $10 Banker bets run a bankroll down until you can't
place the next bet:

| Bankroll | Within 1 hour | Within 3 hours | Within 10 hours |
|---|---|---|---|
| $100 (10 bets) | 26% | 54% | 78% |
| $200 (20 bets) | 1.8% | 19% | 54% |
| $300 (30 bets) | 0.02% | 4.4% | 33% |
| $500 (50 bets) | 0.00% | 0.05% | 8.3% |

A practical rule: **bring at least 20 to 30 bets for each hour you plan to play**, and treat it as
money you've already spent on entertainment. The expected cost is the price, and the bankroll is
how much rope the swings get.

:::math Where these numbers come from
SD per $1, Banker: √(E[X²] − EV²) with X ∈ {+0.95, −1, 0}: ≈ 0.9274. Player: 0.9512. Tie 8:1: 2.6409.
After n hands, the SD is 0.9274 × √n bets. For n = 72 that's 7.87 bets, or $78.69 at $10.
"Chance to be ahead" uses the normal approximation Φ(−edge·√n / SD).
The bankroll table is an exact dynamic program over the bankroll in 5¢ steps, with hands treated as
independent (the shoe's memory is far too small to matter here, lesson 17).
:::

**Simulator scenes**

```scene
id: l15-s1
version: 1
title: A hundred evenings
bankroll: 50000
showEV: true
ui: { speed: fast, showSession: true }
autoPlay:
  enabled: true
  defaultStrategy: { id: flat-banker, unit: 1000 }
  handOptions: [720]
  sessions: [100]
steps:
  - id: run
    text: "Start with **$500** and bet $10 on Banker for **10 hours** (720 hands). Run **100 sessions**."
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "The band shows the middle 80% of results, and the survival curve shows how many sessions still had chips. About **8 in 100** run out within 10 hours with $500 (50 bets). The dashed expected line ends close to **−$76**: ten hours of the edge."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Over one hour of $10 Banker bets, which is bigger?
  options: ["The expected loss", "The typical swing", "They're equal"]
  answer: 1
  explain: "Expected −$7.62; typical swing about ±$79."
- q: Which bet swings the most per dollar?
  options: ["Banker", "Player", "Tie", "Dragon 7"]
  answer: 3
  explain: "Dragon 7 pays 40 to 1 and rarely hits: SD ≈ 6.08 per $1."
- q: You'll play $10 Banker for 2 hours. Which bankroll is a sensible minimum?
  options: ["$20", "$100", "$400 to $600", "$10,000"]
  answer: 2
  explain: "20 to 30 bets per hour you plan to play: 40 to 60 bets, so $400 to $600."
```

---

### Lesson 16: `roads-and-streaks`: Scoreboards, streaks and the gambler's fallacy

**Front matter:** `chapter: perfect-practical` · `minutes: 8` · summary: "The scoreboards record the past. They can't predict the next hand."

**Objectives**

* Read the **Bead Plate** and the **Big Road**.
* Know what the derived roads (Big Eye Boy, Small Road, Cockroach Pig) are.
* Explain why streaks don't change the odds of the next hand (the **gambler's fallacy**).

**Lesson**

Walk past any baccarat table and you'll see glowing scoreboards full of red and blue circles. Casinos
provide them because players love them. Here's how to read them, and what they can and can't tell you.

**Bead Plate.** One bead per hand, in order: down the column, then on to the next column. Each bead is
labelled **B** (Banker), **P** (Player) or **T** (Tie). Red is Banker and blue is Player, but the letter
is always there, so you never need the colour.

**Big Road.** The same results, grouped into **streaks**. Each column is a run of the same winner:
Banker, Banker, Banker goes down one column, and the moment Player wins, a new column starts. Ties
don't start a column. They're marked as a slash or a number on the last bead. A long column is a
"dragon".

**Derived roads** (*Big Eye Boy*, *Small Road*, *Cockroach Pig*) are drawn from the Big Road. They
compare the length of each column with columns one, two or three to the left, and mark red for
"repeating" and blue for "choppy". The app explains them in **More → Roads** but doesn't draw them.
They're patterns of patterns, and they carry no more information than the Big Road.

**The gambler's fallacy.** After six Bankers in a row, it **feels** as if Player is due, or that the
Banker is "hot". Neither is true. The cards don't remember who won. After a run of Bankers, the next hand
is still Banker 45.86%, Player 44.62%, Tie 9.52%, give or take a few hundredths of a percent from the
cards already used.

Streaks are just what randomness looks like. In a shoe of about 73 decided hands:

| A run of at least… | happens in about this share of shoes (≈ approx.) |
|---|---|
| 5 | 92% |
| 6 | 69% |
| 7 | 43% |
| 8 | 24% |
| 10 | 6% |

The longest run in a shoe averages about **6.5** hands. Seeing a "dragon" is normal. It doesn't
mean the shoe is biased.

:::math Is each hand really independent?
Almost. The shoe is dealt without replacement, so each card used changes the odds very slightly. Removing
one card from a fresh 8-deck shoe moves the Banker's EV by at most **0.012%** (a 4 helps the Banker most,
a 6 hurts it most; lesson 17). The winner of the last hand says almost nothing about which cards were
used, so the effect of a streak is smaller still. The table above assumes independent hands with
P(Banker | decided) = 279815987114/552096050907 ≈ 50.68%, and is a dynamic-programming result.
:::

**Simulator scenes**

```scene
id: l16-s1
version: 1
title: After six Bankers
bankroll: 50000
showEV: true
ui: { roads: [bead-plate, big-road] }
history: [P, B, P, P, T, B, B, B, B, B, B]
steps:
  - id: read
    text: "This shoe has just had **six Bankers in a row**. Tap the **Big Road** and find the long column."
    allowedActions: []
    completeWhen: { tapped: big-road }
  - id: ev
    text: "Is Player \"due\"? Open the EV sheet on **Player** and then **Banker**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { previewed: { bet: player } }, { previewed: { bet: banker } } ] }
  - id: same
    text: "Exactly the same prices as a fresh shoe: Banker 1.06%, Player 1.24%. Place any $10 bet and deal."
    allowedActions: [set-bet, clear-bets, deal]
    allowedBets: [player, banker]
    completeWhen: { hands: 1 }
  - id: bead
    text: "Your hand went onto both roads. Tap the **Bead Plate** to see it in plain order."
    allowedActions: []
    completeWhen: { tapped: bead-plate }
```

```quiz
- q: Banker has won seven in a row. What's the chance the next hand is Banker?
  options: ["Much lower: Player is due", "Much higher: Banker is hot", "About 45.9%, the same as always", "50%"]
  answer: 2
  explain: "The cards have no memory. Past results don't change the next hand's odds in any useful way."
- q: On the Big Road, what does a new column mean?
  options: ["A tie", "The winner changed", "A new shoe", "A natural"]
  answer: 1
  explain: "Each column is a streak. A new column starts when the other side wins."
- q: In a typical shoe, how unusual is a run of 6 or more?
  options: ["Very rare, under 5% of shoes", "It happens in most shoes", "It never happens"]
  answer: 1
  explain: "About 69% of shoes have one."
```

---

### Lesson 17: `card-counting`: Can you count cards at baccarat?

**Front matter:** `chapter: perfect-practical` · `minutes: 9` · summary: "In theory yes; in practice the main bets barely move. Dragon 7 is the famous exception."

**Objectives**

* Explain **effects of removal**: how each card left in the shoe moves each bet's EV.
* Know why counting fails for Player and Banker: the edge almost never flips, and it never flips by much.
* Know the **Dragon 7 count** and why casinos guard that bet.
* Use the **Shoe tracker** to see exact EVs for the cards left.

**Lesson**

In blackjack, counting works because the cards left in the shoe can swing the edge to the player. Baccarat
is dealt from a shoe too, so does the same trick work?

**For the main bets, effectively no.** Every card dealt shifts the odds a little, but the Banker and Player
hands use the same cards and the shifts cancel almost perfectly. Removing one card from a fresh shoe
moves the Banker EV by at most 0.012%. A huge imbalance is needed to overcome a 1.06% edge.

| One card removed (8 decks) | Banker EV changes by | Player EV changes by |
|---|---|---|
| 4 | **+0.0116%** | −0.0120% |
| 3 | +0.0065% | −0.0067% |
| 6 | **−0.0113%** | +0.0113% |
| 5 | −0.0083% | +0.0084% |

In our simulation of a real shoe (burn, cut card 16 from the end), with **perfect knowledge** of every card
left, the Banker bet was in your favour in about **1 hand in 900**, and then only by about **0.3%**. Betting
$100 only on those hands would earn about **3 cents an hour**. Even a shoe stripped of all its 4s with
twice the usual 6s left leaves the Banker at −0.46%.

**The exception: Dragon 7.** The EZ side bet that pays 40 to 1 on a Banker three-card 7 is far more
sensitive. **8s and 9s** left in the shoe hurt it (they make naturals and spoil three-card 7s), and **4s to 7s**
help it. The best-known count (by Eliot Jacobson) is:

| Card seen | 4, 5, 6, 7 | 8, 9 | Others |
|---|---|---|---|
| Count | −1 | **+2** | 0 |

Divide the running count by the decks left. When it's **+4 or more**, the Dragon 7 has an edge for the
player. In our simulation that happened on about **9% of hands**, worth about **+7%** per bet on those
hands: roughly **$11 an hour** for a $25 Dragon 7 bettor (≈ simulated).

That's real, but casinos know it. They cap Dragon 7 bets, watch players who bet it only late in the shoe,
and can shuffle at will. Counting the Dragon 7 is legal, but it isn't welcome.

**The Shoe tracker.** Turn it on in Settings, or here in the scene. It shows the **exact** EV of every bet
for the cards left in this shoe, updated after each hand. The normal EV sheet always shows the fresh-shoe
price. Watch the tracker for a few shoes and you'll see the main bets hardly move, while Dragon 7 and
Panda 8 swing.

:::math How the tracker computes EV
The tracker runs the same exact enumeration as the reference tables, over the **unseen** cards: everything
not yet shown. The face-down burn cards are still unseen, so they count as in the shoe. Each result is
exact for that composition.
Effects of removal (fresh 8 decks, % per card, Dragon 7): 0s +0.086, A +0.050, 2 −0.090, 3 −0.108, 4 −0.268,
5 −0.263, 6 −0.324, 7 −0.358, 8 **+0.538**, 9 **+0.479**. The count's signs follow these.
Simulation: 3,000 shoes, 239,739 hands, exact EV before every hand. Banker +EV in 0.113% of hands (average
+0.32% when positive). Dragon 7 +EV in 11.0% of hands. With the count at a true +4 or more: 8.7% of hands, average
+7.03% per bet.
:::

**Simulator scenes**

```scene
id: l17-s1
version: 1
title: The tracker on a fresh shoe
bankroll: 100000
showEV: true
bets: { banker: 1000 }
ui: { shoeTracker: true, speed: fast }
steps:
  - id: open
    text: "The **Shoe tracker** is on. Tap it to open it: on a fresh shoe it matches the EV sheet."
    allowedActions: []
    completeWhen: { tapped: shoe-tracker }
  - id: run
    text: "Deal **20 hands** (tap **Rebet & Deal**) and watch the Banker and Player rows on the tracker."
    allowedActions: [deal, rebet]
    allowedBets: [banker]
    completeWhen: { hands: 20 }
  - id: read
    text: "They barely moved: a few hundredths of a percent either way. That's why counting the main bets doesn't pay."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l17-s2
version: 1
title: A Dragon 7 shoe
variant: ez
bankroll: 100000
showEV: true
ui: { shoeTracker: true }
shoe: { removed: { "0": 111, "1": 28, "2": 27, "3": 27, "4": 27, "5": 27, "6": 27, "7": 27, "8": 32, "9": 31 } }   # leaves 52: 17 tens, 4 aces, five each of 2–7, no 8s, one 9
steps:
  - id: look
    text: "Late in an EZ shoe: **52 cards left**, with no 8s and a single 9. Open the tracker."
    allowedActions: []
    completeWhen: { tapped: shoe-tracker }
  - id: d7
    text: "Dragon 7 is now worth about **+32%** for the cards left, against −7.61% on a fresh shoe. Open the EV sheet on **Dragon 7**: the sheet still shows the fresh-shoe −7.61%, and the tracker shows this shoe."
    allowedActions: [set-bet, clear-bets]
    allowedBets: [dragon-7]
    completeWhen: { previewed: { bet: dragon-7 } }
  - id: end
    text: "Shoes this extreme are rare, and casinos cap the bet. Still, this is the one place in baccarat where counting has teeth."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Why doesn't card counting work for Banker and Player?
  options: ["Counting is illegal", "Each card moves their EV by only about 0.01%, so the edge almost never flips", "The shoe is reshuffled every hand", "The dealer hides the cards"]
  answer: 1
  explain: "The effects are tiny and largely cancel. Positive spots are rare and small."
- q: Which cards remaining in the shoe are bad for the Dragon 7?
  options: ["4s to 7s", "8s and 9s", "Tens and faces", "Aces"]
  answer: 1
  explain: "8s and 9s make naturals and break three-card 7s. When they've been used up, Dragon 7 improves."
- q: What does the EV sheet show, compared with the Shoe tracker?
  options: ["Both show this shoe", "The sheet shows the fresh-shoe price; the tracker shows the cards left", "The tracker is an estimate"]
  answer: 1
  explain: "Both are exact. The sheet is for a full shoe, and the tracker for the cards still unseen."
```

---

### Lesson 18: `strategy-practical`: Perfect strategy II: a plan you can follow

**Front matter:** `chapter: perfect-practical` · `minutes: 6` · summary: "Pick the table, the bet size, the session length, and stick to them."

**Objectives**

* Build a session plan from a budget: table, bet size, hours, bankroll.
* Know which habits cost money (Tie, side bets, chasing) and which are free (sitting out, stopping).
* Know that stop-loss and win goals manage spending but don't change the edge.

**Lesson**

Perfect strategy I said "bet Banker". This is the practical version: how to turn that into a night out
that costs what you planned.

**1. Choose the table.** Look for EZ Baccarat (1.02%) or a standard 5% commission game (1.06%). Avoid
Super 6 for Banker bets (1.46%), or bet Player there (1.24%). If the Tie bet interests you, look for
9 to 1.

**2. Choose the bet size from the hourly cost, not from the bankroll.** Decide what an hour of fun is
worth to you. At 72 hands an hour: $5 Banker costs about $3.81 an hour, $10 about $7.62, $25 about $19.

**3. Bring 20–30 bets per hour you plan to play** (lesson 15). That makes running out early unlikely.

**4. Bet Banker, flat.** Flat means the same bet every hand. Changing your bet with wins and losses doesn't
change the edge, but it usually makes you bet more on average (lesson 19).

**5. Set a stop.** "Stop if I'm down $200" or "stop after two hours" won't change the edge, but it does
cap how much you can spend, and it's the most useful habit there is.

**6. Mind the commission.** At a commission-box table, keep track of what you owe: 5% of each Banker win.
It's settled when you leave or at the end of the shoe (lesson 23).

Habits that cost real money, at $10 a hand for an hour:

| Habit | Extra cost per hour |
|---|---|
| A $10 Tie bet every hand, alongside Banker | +$103.39 |
| A $5 Pair bet every hand | +$37.30 |
| Raising the bet from $10 to $25 "when it's hot" half the time | +$5.71 |
| Betting Player instead of Banker | +$1.27 |
| Sitting out every other hand | −$3.81 (saves) |

:::tip
**Comps** (free meals, rooms) are usually worth a fraction of your expected loss. They're a nice extra,
not a reason to bet more.
:::

**Simulator scenes**

```scene
id: l18-s1
version: 1
title: Your plan, played
bankroll: 30000
showEV: true
ui: { showSession: true }
steps:
  - id: bet
    text: "Your plan: **$10 Banker, flat, $300 bankroll**. Place the bet."
    allowedActions: [set-bet, clear-bets]
    allowedBets: [banker]
    expect: [ { type: set-bet, bet: banker } ]
    completeWhen: { betOnFelt: { bet: banker, minAmount: 1000 } }
  - id: play
    text: "Deal **12 hands**, about ten minutes of real play. Use **Rebet & Deal** to keep it flat."
    allowedActions: [deal, rebet]
    allowedBets: [banker]
    completeWhen: { hands: 12 }
  - id: check
    text: "Tap the **session panel**. Expected is about −$1.27 for 12 hands. Your actual result is mostly luck, and that's the point of a plan: the price stays known."
    allowedActions: []
    completeWhen: { tapped: session }
```

```quiz
- q: Which of these changes the house edge on your bets?
  options: ["A stop-loss", "A win goal", "Betting Tie instead of Banker", "Taking a break"]
  answer: 2
  explain: "Stops and breaks control spending and pace. Only the choice of bet changes the edge."
- q: You want to spend about $20 an hour on average. Which plan fits?
  options: ["$10 Banker", "$25 Banker", "$100 Banker", "$10 Tie"]
  answer: 1
  explain: "72 × $25 × 1.06% ≈ $19.04 an hour."
- q: At a Super 6 table, what's the practical main bet?
  options: ["Banker", "Player", "Tie"]
  answer: 1
  explain: "Player 1.24% beats Super 6 Banker 1.46%."
```

---

### Lesson 19: `betting-systems`: Martingale, Paroli and friends: what they really cost

**Front matter:** `chapter: perfect-fun` · `minutes: 10` · summary: "No system changes the edge. Most raise your average bet, and with it the hourly cost."

**Objectives**

* Describe the common systems: Martingale, Paroli, 1-3-2-6, Fibonacci, D'Alembert, Labouchère, follow the shoe.
* Know the one fact that settles them all: **every bet keeps its own house edge**, so a system's cost is
  **edge × the total it makes you bet**.
* Compare their real hourly costs, and run them side by side on the same cards.

**Lesson**

Betting systems change **how much** you bet based on what just happened. They're fun, they can make a
session feel structured, and some have produced memorable wins. None of them can beat the game, because
each individual bet still loses 1.06% (on Banker) on average. Sum that over every bet the system
makes and the answer is always the same:

> **Expected cost = house edge × total amount bet**

So the honest question about any system is: **how much does it make me bet?** Here are the common ones,
with a $10 unit on Banker:

| System | How it works | Average bet | Cost per hour (72 hands) |
|---|---|---|---|
| **Flat** | Same bet every hand | $10.00 | **$7.62** |
| Follow the shoe | Flat, on whichever side won last | $10.00 | ≈ $8.25 |
| Paroli | Double after a win, up to 3 wins (1-2-4), then back to 1 | $17.13 | $13.05 |
| 1-3-2-6 | After each win, move along 1, 3, 2, 6 units; any loss restarts | $19.98 | $15.22 |
| Fibonacci | After a loss, the next number in 1-1-2-3-5-8…89; after a win, back two | $24.57 | $18.71 |
| Martingale | Double after every loss, back to 1 after a win; at most 7 bets ($10–$640) | $33.24 | $25.32 |
| D'Alembert | +1 unit after a loss, −1 after a win (1 to 20 units) | $45.74 | $34.84 |
| Labouchère | Write 1-2-3-4. Bet first + last; a win crosses them off, a loss adds the bet to the end (bets capped at 100 units) | ≈ $125 | ≈ $95 (≈ simulated) |

(Average bets are for a fresh one-hour session, ties included.)

**Martingale, up close.** It feels unbeatable: keep doubling and one win gets everything back. It
usually works. Then, about once every **141 series** on Banker, the table produces **seven losses in
a row**, and you've lost $10 + $20 + … + $640 = **$1,270** with the table limit or your bankroll in
the way. On Banker it's worse than it looks: the commission means a win after five losses pays $304
against $310 lost, so even the "rescue" loses $6. The many small wins and the rare disaster average
out to the same 1.06% of everything you bet, and Martingale makes you bet a lot.

**Loss-chasing systems** (Martingale, Fibonacci, D'Alembert, Labouchère) raise your bet after losses, so
your biggest bets come when you're behind. **Win-riding systems** (Paroli, 1-3-2-6) raise only with
money you've just won, so their worst case is a normal losing session. If you enjoy a system, the
cheapest feel-good choice is a win-rider at a small unit.

:::math How the hourly costs are computed
Each system is a Markov chain over its progression state. Ties leave the state unchanged. Starting
from the first step, the exact expected bet on each of the 72 hands is summed and multiplied by the
Banker edge 114753351728/10847218479825. Example: Martingale's E[total bet over 72 hands] = 239.30
units, so the cost is 239.30 × $10 × 1.0579% = $25.32. Labouchère has no small state space, so it was
simulated (200,000 one-hour sessions). Follow the shoe is ≈ 50.68% × 1.0579% + 49.32% × 1.2351% = 1.1453% of
$720. On Player, the costs are higher (flat $8.89, Martingale $31.23; §7.2).
:::

**Simulator scenes**

```scene
id: l19-s1
version: 1
title: Eight systems, same cards
bankroll: 1000000
showEV: true
ui: { speed: fast, showSession: true }
autoPlay:
  enabled: true
  handOptions: [72]
  sessions: [100]
  compare:
    - { id: flat-banker, unit: 1000 }
    - { id: follow-the-shoe, unit: 1000 }
    - { id: paroli, unit: 1000, target: banker }
    - { id: one-three-two-six, unit: 1000, target: banker }
    - { id: fibonacci, unit: 1000, target: banker }            # resets after a loss on 89 units
    - { id: martingale, unit: 1000, target: banker, maxSteps: 7 }
    - { id: dalembert, unit: 1000, target: banker, maxUnits: 20 }
    - { id: labouchere, unit: 1000, target: banker, sequence: [1, 2, 3, 4], maxBetUnits: 100 }
steps:
  - id: run
    text: "Each system plays **100 one-hour sessions** (72 hands) on the **same cards**, from a $10,000 bankroll and a $10 unit. Tap **Run**."
    completeWhen: { autoPlayCompleted: { minHands: 72 } }
  - id: read
    text: "Compare **cost per hour** with the table above: each system's expected line matches it. Every system lost about 1.06% of what it bet. Martingale shows many small wins and a few deep holes. Labouchère wagers the most by far."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: What does a betting system change?
  options: ["The house edge", "How much you bet, and so the cost per hour", "The odds of the next hand", "Nothing at all"]
  answer: 1
  explain: "Each bet keeps its edge. A system only changes the amounts, and so the total you put at risk."
- q: "With $10 Martingale on Banker, capped at seven bets, roughly how often do you lose all seven?"
  options: ["Never", "About once every 141 series", "Half the time", "Once every 10,000 series"]
  answer: 1
  explain: "Seven straight Player wins (ties don't count) happen about 0.71% of the time: $1,270 lost."
- q: Which system costs the least per hour?
  options: ["Martingale", "Paroli", "Flat betting", "D'Alembert"]
  answer: 2
  explain: "Flat betting at your unit has the smallest average bet, and so the smallest cost."
- q: Why is Paroli gentler on your bankroll than Martingale?
  options: ["It has a lower edge", "It raises bets only with winnings, not after losses", "It never loses", "It bets Tie"]
  answer: 1
  explain: "Win-riders risk the money they've just won. Loss-chasers raise when you're behind."
```

---

### Lesson 20: `pairs-and-dragon-bonus`: Pairs and the Dragon Bonus

**Front matter:** `chapter: perfect-fun` · `minutes: 7` · summary: "Pairs pay 11:1 but cost 10%. Dragon Bonus on Player is the cheapest side bet."

**Objectives**

* Settle Player Pair, Banker Pair and Dragon Bonus bets.
* Know their edges: Pair 10.36% (8 decks), Dragon Bonus Player 2.65%, Banker 9.37%.
* Know that Dragon Bonus on Player is the least expensive side bet on the default table.

**Lesson**

Side bets are optional bets placed next to your main bet. They pay more, they hit less, and they cost
more.

**Player Pair / Banker Pair.** Wins if that hand's **first two cards are the same rank**: {{8h 8c}} yes, {{Kd Qd}}
no (different ranks, even though both count 0). Pays **11 to 1**. A pair turns up about once in 13.4
hands per side, so a fair payout would be about 12.4 to 1. At 11 to 1 the edge is **10.36%** with 8 decks, and **11.25%** with 6.
Fewer decks mean fewer cards of each rank, so pairs are rarer.

**Dragon Bonus.** Pick a side (Player or Banker). It pays if your side wins **convincingly**:

| Your side… | Pays |
|---|---|
| wins with a **natural** (8 or 9 on two cards) | 1 to 1 |
| ties with a natural | push |
| wins **without** a natural by **9** points | 30 to 1 |
| … by 8 | 10 to 1 |
| … by 7 | 6 to 1 |
| … by 6 | 4 to 1 |
| … by 5 | 2 to 1 |
| … by 4 | 1 to 1 |
| anything else (smaller win, loss, other tie) | loses |

On **Player** the edge is **2.65%**, the cheapest side bet in this app. On **Banker** it's **9.37%**.
Why the difference? The Banker's drawing rule wins a lot of **close** hands, and close wins don't
pay here. When the Player wins, it wins by a wide margin a bit more often.

| Side bet | Edge | $5 a hand for an hour |
|---|---|---|
| Dragon Bonus, Player | 2.65% | $9.55 |
| Dragon Bonus, Banker | 9.37% | $33.74 |
| Player Pair or Banker Pair | 10.36% | $37.30 |

:::math Dragon Bonus on Player, exactly (8 decks)
P(Player wins with a natural) = 74989984/461223945 ≈ 16.259%. P(natural tie) = 1648498/92244789 ≈ 1.787%.
P(Player wins without a natural by m), m = 4…9: 3.737%, 3.324%, 2.826%, 1.792%, 0.682%, 0.368% (exact fractions in §11).
EV = 1·P(nat win) + Σ payₘ·P(win by m) − P(lose) = −103547854751/3904998652737 ≈ **−2.6517%**.
Pairs: P(pair) = 13 · 32 · 31 / (416 · 415) = 31/415, so EV = 12 × 31/415 − 1 = −43/415 ≈ −10.3614%.
With 6 decks: 23/311, EV −35/311 ≈ −11.2540%.
:::

**Simulator scenes**

```scene
id: l20-s1
version: 1
title: A hand that pays three ways
bankroll: 50000
allowedBets: [player, player-pair, dragon-bonus-player]
showEV: true
steps:
  - id: bet
    text: "Bet **$10 on Player**, **$5 on Player Pair** and **$5 on Dragon Bonus (Player)**. Open the EV sheet on each side bet as you place it."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: player, minAmount: 1000 } }, { betOnFelt: { bet: player-pair, minAmount: 500 } }, { betOnFelt: { bet: dragon-bonus-player, minAmount: 500 } }, { previewed: { bet: player-pair } }, { previewed: { bet: dragon-bonus-player } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Ac, Ad, 7h], banker: [Kc, Qc, Jh] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "A pair of aces (+$55 on the Pair). Player draws to 9 while the Banker stays on 0, so Player wins **by 9 without a natural**: Dragon Bonus pays 30 to 1, **+$150**. Player +$10. Total **+$215**. Hands like this are why side bets exist. The Dragon Bonus 30 to 1 comes about once in 270 hands."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player's first two cards are {{Kd Qs}}. Does Player Pair win?"
  options: ["Yes, both count 0", "No, they're different ranks"]
  answer: 1
  explain: "A pair means the same rank. K and Q are different, even though both are worth 0."
- q: "Player wins 7 to 2 with three cards each. What does Dragon Bonus on Player pay?"
  options: ["1 to 1", "2 to 1", "4 to 1", "It loses"]
  answer: 1
  explain: "A non-natural win by 5 pays 2 to 1."
- q: Which side bet has the lowest edge on the default table?
  options: ["Player Pair", "Dragon Bonus on Banker", "Dragon Bonus on Player", "Tie"]
  answer: 2
  explain: "Dragon Bonus Player: 2.65%."
- q: "Banker wins 9 to 8 with two naturals. What does Dragon Bonus on Banker pay?"
  options: ["30 to 1", "1 to 1", "Push", "It loses"]
  answer: 1
  explain: "A win with a natural pays 1 to 1, whatever the margin."
```

---

### Lesson 21: `ez-side-bets`: Dragon 7, Panda 8 and the rest of the side bets

**Front matter:** `chapter: perfect-fun` · `minutes: 7` · summary: "The EZ table's two famous bets, plus a tour of side bets you'll meet elsewhere."

**Objectives**

* Settle **Dragon 7** (40:1) and **Panda 8** (25:1) at an EZ table.
* Know their edges: 7.61% and 10.19%.
* Recognise other side bets and their prices: Either Pair, Perfect Pair, Lucky 6, Big/Small, Super 6.

**Lesson**

**Dragon 7** (EZ only) wins when the **Banker wins with a three-card 7**: the same hand that makes EZ Banker
bets push. Pays **40 to 1**. It happens about once in 44 hands, so a fair payout would be about 43.4 to 1.
Edge: **7.61%**.

**Panda 8** (EZ only) wins when the **Player wins with a three-card 8**. Pays **25 to 1**. It happens about once
in 29 hands (fair would be about 28 to 1). Edge: **10.19%**.

Dragon 7 is the bet card counters target (lesson 17). Off the count, it's just an expensive thrill.

**Other side bets you'll meet** (not in the app's simulator; paytables vary, so check the sign):

| Bet | Wins when | Typical pay | Edge (8 decks) |
|---|---|---|---|
| Either Pair | Either hand starts with a pair | 5:1 | 13.71% |
| Perfect Pair | Either hand starts with a **suited** pair | 25:1 (200:1 both) | 8.05% |
| Lucky 6 | Banker wins with a 6 | 12:1 two cards, 20:1 three cards | 16.68% |
| Big | The hand uses 5 or 6 cards | 0.54:1 | 4.35% |
| Small | The hand uses exactly 4 cards | 1.5:1 | 5.28% |
| Super 6 side bet | Banker wins with a 6 | 12:1 (15:1) | 29.98% (13.82%) |
| Tie at 9:1 | Tie | 9:1 | 4.84% |

None of them beats Banker's 1.06%. The best of these are the Big/Small bets and a 9:1 Tie, at 4–5%. The
Super 6 side bet at 12 to 1 is among the worst bets in any casino.

:::math Dragon 7 and Panda 8, exactly (8 decks)
P(Dragon 7) = 19129247848/848912750595 ≈ 2.2534%. EV = 41·P − 1 = −64613588827/848912750595 ≈ **−7.6113%**.
P(Panda 8) = 674456106496/19524993263685 ≈ 3.4543%. EV = 26·P − 1 = −153010345753/1501922558745 ≈ **−10.1876%**.
Lucky 6: P(Banker wins with a two-card 6) ≈ 3.7247%, three-card ≈ 1.6617%; EV ≈ −16.68%.
Big/Small: P(4 cards) = 140356/370461 ≈ 37.887%.
:::

**Simulator scenes**

```scene
id: l21-s1
version: 1
title: Panda 8
variant: ez
bankroll: 50000
allowedBets: [player, panda-8, dragon-7]
showEV: true
steps:
  - id: bet
    text: "At an EZ table: **$10 on Player** and **$5 on Panda 8**. Open the EV sheet on **Panda 8** and **Dragon 7**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: player, minAmount: 1000 } }, { betOnFelt: { bet: panda-8, minAmount: 500 } }, { previewed: { bet: panda-8 } }, { previewed: { bet: dragon-7 } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [2c, Kd, 6d], banker: [Qd, 5h, Ts] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Player drew a 6 to make **8 with three cards**, and the Banker drew a ten and stayed on 5. **Panda 8 pays 25 to 1: +$125**, and the Player bet +$10."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: When does Dragon 7 win?
  options: ["Any Banker 7", "Banker wins with a three-card 7", "Player wins with 7", "A 7-7 tie"]
  answer: 1
  explain: "Three cards, total 7, and the Banker must win."
- q: Which has the lower edge?
  options: ["Dragon 7 (7.61%)", "Panda 8 (10.19%)"]
  answer: 0
  explain: "Both are expensive, and Panda 8 more so."
- q: Which of these side bets is the most expensive?
  options: ["Big", "Perfect Pair", "Lucky 6", "Super 6 side bet at 12:1"]
  answer: 3
  explain: "About 30%."
```

---

### Lesson 22: `strategy-fun-per-dollar`: Perfect strategy III: the most fun per dollar

**Front matter:** `chapter: perfect-fun` · `minutes: 7` · summary: "Spend your budget where the thrills are cheapest."

**Objectives**

* Price a mixed session (main bet + side bets + system) per hour.
* Compare "big moments per hour" against cost per hour for the side bets.
* Build a fun-per-dollar plan.

**Lesson**

Not everybody plays to lose as little as possible. Many people play for the big moments: a 30 to 1
Dragon Bonus, a tie at 8 to 1, a run of Paroli wins. That's fine. This chapter is about **getting the most
of those moments for each dollar the evening costs**.

Here's what each $5 side bet buys in an hour (72 hands), next to what it costs:

| $5 side bet | Big win | Big wins per hour (avg) | Cost per hour |
|---|---|---|---|
| Dragon Bonus, Player | 30:1 / 10:1 / 6:1 (wins by 9, 8, 7) | 2.1 (all three) | **$9.55** |
| Tie 9:1 (if offered) | 9:1 | 6.9 | $17.44 |
| Dragon 7 (EZ) | 40:1 | 1.6 | $27.40 |
| Panda 8 (EZ) | 25:1 | 2.5 | $36.68 |
| Player Pair | 11:1 | 5.4 | $37.30 |
| Tie 8:1 | 8:1 | 6.9 | $51.69 |

**The fun-per-dollar plan:**

1. **Base: flat Banker** at a unit you're happy with (or EZ Banker).
2. **If you want side action, start with Dragon Bonus on Player**: it costs about a quarter of a Pair bet
   for the same stake.
3. **If you like Tie, find 9 to 1**, or bet it rarely and small.
4. **If you like systems, pick a win-rider** (Paroli or 1-3-2-6) at a small unit. Skip loss-chasers.
5. **Budget the hour, not the hand**: "$10 Banker + $5 Dragon Bonus Player ≈ $17 an hour" is a plan you can
   check against your wallet.

An example evening of 3 hours:

| Plan | Cost per hour | 3 hours |
|---|---|---|
| $10 Banker | $7.62 | $22.85 |
| $10 Banker + $5 Dragon Bonus Player | $17.16 | $51.49 |
| $10 Banker + $5 Tie (8:1) | $59.31 | $177.93 |
| $10 Martingale on Banker | $25.32 | $75.96 |

**Simulator scenes**

```scene
id: l22-s1
version: 1
title: Three ways to spend an evening
bankroll: 300000
showEV: true
ui: { speed: fast, showSession: true }
autoPlay:
  enabled: true
  handOptions: [720]
  sessions: [100]
  compare:
    - { id: flat-banker, unit: 1000, label: "$10 Banker" }
    - { id: flat-banker, unit: 1000, sideBets: { dragon-bonus-player: 500 }, label: "+ $5 Dragon Bonus Player" }
    - { id: flat-banker, unit: 1000, sideBets: { tie: 500 }, label: "+ $5 Tie" }
steps:
  - id: run
    text: "Run **100 sessions of 10 hours** (720 hands) for each plan on the same cards. Tap **Run**."
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "The Dragon Bonus plan has bigger swings and some big nights, and its expected line ends only about **$95** below plain Banker (**−$172** against **−$76**). The Tie plan's expected line ends about **$517** below, at **−$593**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: You want a side bet for excitement at the lowest price. Which one?
  options: ["Player Pair", "Tie 8:1", "Dragon Bonus on Player", "Lucky 6"]
  answer: 2
  explain: "2.65%: about $9.55 an hour at $5."
- q: "$10 Banker plus $5 Dragon Bonus Player for 2 hours costs on average about…"
  options: ["$15", "$34", "$60", "$120"]
  answer: 1
  explain: "$17.16 an hour × 2 ≈ $34.33."
- q: Which kind of system fits a fun-per-dollar plan best?
  options: ["Martingale", "Labouchère", "Paroli at a small unit", "D'Alembert"]
  answer: 2
  explain: "Win-riders raise only with winnings and cost the least of the systems."
```

---

### Lesson 23: `at-the-casino`: Playing at a real table

**Front matter:** `chapter: real-casino` · `minutes: 7` · summary: "Mini, midi and big tables, the squeeze, the commission box and the manners."

**Objectives**

* Tell mini-baccarat, midi-baccarat and the big table apart.
* Know what the **squeeze** is, and that it changes nothing.
* Handle buy-in, commission, scorecards and tipping politely.
* Know that Chemin de Fer and Baccarat Banque exist and how they differ.

**Lesson**

**Three kinds of table, same game.**

* **Mini-baccarat**: a blackjack-sized table, up to 7 seats, one dealer who handles every card. Low minimums,
  fast play: about 72 hands an hour. This is where most people play.
* **Midi-baccarat**: up to 9 seats, higher limits. The player with the biggest bet on each side may get to turn
  over the cards.
* **Big table** ("big baccarat"): 12 to 14 seats in a roped-off area, a team of dealers, high limits. Players
  take turns acting as the shoe holder and turn over the cards. Slow and ceremonial: roughly 40 hands an hour.

**The squeeze.** At midi and big tables, the player with the largest bet may **squeeze** the cards:
peel them up slowly from one corner or side, hunting for the spots that reveal the value. It's pure
theatre. The card was decided when the shoe was shuffled. The squeeze adds suspense and slows the game,
which makes it cheaper per hour. The app always reveals cards with a quick flip.

**Commission box.** Many commission tables don't take the 5% from each win. The dealer pays the full
amount and places a marker in a numbered box matching your seat: 50¢ for a $10 Banker win, and so on. You
pay what you owe **before you leave** or when the shoe ends. Bet in amounts that make the commission easy:
$20 wins owe $1 each.

**Etiquette.**

* Buy in by placing cash on the table **between hands**. The dealer can't take cash from your hand.
* Bet before the dealer calls "**no more bets**", and don't touch your chips once the cards are out.
* Don't touch the cards unless the table invites you to (midi and big tables).
* Scorecards and pencils are free. Track the roads if you enjoy it (lesson 16 says what they're worth).
* Tip by placing a small bet for the dealers, or by handing chips over when you leave.
* Superstitions are everywhere: a lucky seat, avoiding the number 4, blowing on cards. Be polite. They cost
  nothing as long as they don't change your bets.

**Old cousins: mention only.** In **Chemin de Fer** ("chemmy") the players take turns being the
Banker, betting against the others, and the house just takes a commission. Some draws are decided by
the players: the Player may choose to draw or stand on 5, and the Banker has options in some spots.
**Baccarat Banque** has a fixed banker playing against two Player hands. Both are rare today, and this
app teaches Punto Banco only.

**Simulator scenes**

```scene
id: l23-s1
version: 1
title: Owing commission
bankroll: 50000
allowedBets: [banker]
showEV: true
steps:
  - id: bet
    text: "Bet **$20 on Banker**: a commission-friendly amount."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { betOnFelt: { bet: banker, minAmount: 2000 } }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [7c, Kh], banker: [4h, Jd, 5c] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: owe
    text: "Banker 9 beats Player 7. At a commission-box table the dealer would pay **$20** and put **$1** in your box. The app takes it straight away, so you're paid **$19**. Tap the **commission** line."
    allowedActions: []
    completeWhen: { tapped: commission }
```

```quiz
- q: What does squeezing the cards change?
  options: ["The odds", "The card's value", "Nothing but the suspense (and the pace)", "The commission"]
  answer: 2
  explain: "The card was already fixed. Squeezing only slows things down."
- q: How do you buy in at a baccarat table?
  options: ["Hand cash to the dealer mid-hand", "Put cash on the table between hands", "Give it to another player"]
  answer: 1
  explain: "Lay it on the felt between hands, and the dealer will change it for chips."
- q: At a commission-box table, when do you pay the commission?
  options: ["Before each hand", "When you leave or at the end of the shoe", "Never"]
  answer: 1
  explain: "The dealer tracks it, and you settle up at the end."
- q: Which table is usually fastest?
  options: ["Mini-baccarat", "Midi-baccarat", "Big table"]
  answer: 0
  explain: "One dealer, no squeezing: about 72 hands an hour."
```

---

### Lesson 24: `final-exam` ✔: Final exam

**Front matter:** `chapter: real-casino` · `minutes: 10` · `checkpoint: true` · summary: "Everything, from card values to fun per dollar."

**Objectives**

* Call any hand.
* Choose the lowest-edge bet at any table, and price any plan per hour.
* Spot myths: streaks, systems and counting.

**Lesson**

Last stop. The scene asks for five calls on random hands, then one bet on a variant table. The quiz covers
the whole course. You can retake it any time. Your best score is kept.

**Simulator scenes**

```scene
id: l24-s1
version: 1
title: Final calls
bankroll: 50000
bets: { banker: 1000 }
seed: 24
showEV: true
onDealsExhausted: random
steps:
  - id: player
    text: "Tap **Deal** and call the Player: **Draw or Stand**? Get two right."
    allowedActions: [deal]
    predict: { kind: player-draws }
    allowedActions: [deal]
    pauseAt: two-cards
    skipNaturals: true
    hint: "0 to 5 draws; 6 and 7 stand."
    completeWhen: { predicted: { correct: true, count: 2 } }
  - id: banker
    text: "Now three right Banker calls. Tap **Deal**."
    allowedActions: [deal]
    predict: { kind: banker-draws }
    allowedActions: [deal]
    pauseAt: player-third
    skipNaturals: true
    hint: "Player stood: 0–5 draws. Player drew: 3 all but 8, 4 on 2–7, 5 on 4–7, 6 on 6–7."
    completeWhen: { predicted: { correct: true, count: 3 } }
```

```scene
id: l24-s2
version: 1
title: Final bet
variant: ez
bankroll: 50000
showEV: true
steps:
  - id: bet
    text: "An EZ table. Place **$10 on the lowest-edge bet** available."
    allowedActions: [set-bet, clear-bets]
    expect: [ { type: set-bet, bet: banker } ]
    hint: "EZ Banker: 1.02%."
    completeWhen: { betOnFelt: { bet: banker, minAmount: 1000 } }
```

```quiz
- q: "What's {{7d 9s}} worth?"
  options: ["16", "6", "7", "9"]
  answer: 1
  explain: "16 → 6."
- q: "Player {{3c Kd}} draws a {{2h}}. Banker has {{Js 4d}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 4 draws on a Player third card of 2 to 7."
- q: "Player {{Th 7c}}. Banker {{5s Kc}}. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "The Player stood on 7, so the Banker uses 0–5 draws."
- q: Which is the lowest-edge bet at a standard 8-deck, 5% commission table?
  options: ["Player", "Banker", "Tie", "Dragon Bonus Player"]
  answer: 1
  explain: "Banker: 1.06%."
- q: $25 Banker, 72 hands an hour, 2 hours. Expected cost?
  options: ["About $3.81", "About $19", "About $38", "About $76"]
  answer: 2
  explain: "72 × 2 × $25 × 1.0579% ≈ $38.08."
- q: After eight Player wins in a row, the next hand is…
  options: ["More likely Banker", "More likely Player", "About as likely as ever to be either"]
  answer: 2
  explain: "Streaks don't change the odds in any useful way."
- q: What does Martingale do to your expected loss?
  options: ["Removes it", "Leaves the edge the same but raises the total bet, so the loss grows", "Halves it"]
  answer: 1
  explain: "Cost = edge × total bet, and Martingale bets more."
- q: Which side bet is the least expensive on the default table?
  options: ["Pair", "Tie", "Dragon Bonus Player", "Dragon Bonus Banker"]
  answer: 2
  explain: "2.65%."
- q: Why can card counting beat the Dragon 7 but not Banker?
  options: ["Dragon 7's EV swings far more with the cards left", "Banker isn't dealt from the shoe", "Counting is banned on Banker"]
  answer: 0
  explain: "8s and 9s have big effects on Dragon 7. On Banker, each card moves the EV by about 0.01%."
```

---

## 6. Reference table: every bet

This table is the authority for `#/bets` (More → Bets) and for the engine's payout registry tests.
8 decks unless noted. "Edge" is the house edge **per hand, ties as pushes** (§3). $/h is for a $10 bet at 72 hands
an hour. Tier per §8.2.

### 6.1 Main bets

| Bet id | Variant | Pays | P(win) | P(push) | Exact EV per $1 | Edge | Ties excluded | SD | $/h @ $10 | Tier |
|---|---|---|---|---|---|---|---|---|---|---|
| `banker` | `punto-banco` | 1:1 less 5% | 45.8597% | 9.5156% | −114753351728/10847218479825 | **1.0579%** | 1.1692% | 0.9274 | $7.62 | Good bet |
| `player` | all | 1:1 | 44.6247% | 9.5156% | −241149546272/19524993263685 | **1.2351%** | 1.3650% | 0.9512 | $8.89 | Good bet |
| `tie` | all | 8:1 | 9.5156% | — | −103841353768/723147898655 | **14.3596%** | = | 2.6409 | $103.39 | Sucker bet |
| `banker` | `ez` | 1:1; three-card 7 win pushes | 43.6064% | 11.7690% | −66274384744/6508331087895 | **1.0183%** | 1.1541% | 0.9393 | $7.33 | Good bet |
| `banker` | `super-6` | 1:1; win on 6 pays 1:2 | 45.8597% | 9.5156% | −284694798368/19524993263685 | **1.4581%** | 1.6114% | 0.9296 | $10.50 | Good bet |
| (lesson only) Tie | 9:1 | 9:1 | 9.5156% | — | −63053127805/1301666217579 | 4.8440% | = | 2.9343 | $34.88 | Fair |
| (lesson only) Banker | 4% commission | 1:1 less 4% | 45.8597% | 9.5156% | −2925372930848/488124831592125 | 0.5993% | — | — | $4.31 | Good bet |
| (illustration) Banker | no commission | 1:1 | 45.8597% | 9.5156% | +241149546272/19524993263685 | −1.2351% (player edge) | — | 0.9512 | — | — |

### 6.2 Side bets

| Bet id | Pays | P(any win) | Exact EV per $1 | Edge | SD | $/h @ $10 | Tier | In app |
|---|---|---|---|---|---|---|---|---|
| `player-pair` / `banker-pair` | 11:1 | 31/415 = 7.4699% | −43/415 | **10.3614%** | 3.4163 | $74.60 | Sucker bet | simulated |
| `dragon-bonus-player` | §2.4 | 28.9887% (+1.7871% push) | −103547854751/3904998652737 | **2.6517%** | 2.4736 | $19.09 | Fair | simulated |
| `dragon-bonus-banker` | §2.4 | 28.2795% (+1.7871% push) | −9683026823/103306842665 | **9.3731%** | 2.3045 | $67.49 | Sucker bet | simulated |
| `dragon-7` (EZ) | 40:1 | 2.2534% | −64613588827/848912750595 | **7.6113%** | 6.0849 | $54.80 | Poor bet | simulated |
| `panda-8` (EZ) | 25:1 | 3.4543% | −153010345753/1501922558745 | **10.1876%** | 4.7481 | $73.35 | Sucker bet | simulated |
| Either Pair | 5:1 | 340163/2365251 = 14.3817% | −108091/788417 | 13.7099% | — | $98.71 | Sucker bet | lesson |
| Perfect Pair | 25:1, 200:1 both | 56513/1689465 = 3.3450% | −135952/1689465 | 8.0470% | — | $57.94 | Poor bet | lesson |
| Perfect Pair (25:1 only) | 25:1 | 3.3450% | −220127/1689465 | 13.0294% | — | $93.81 | Sucker bet | lesson |
| Lucky 6 | 12:1 / 20:1 | 5.3864% | −47209656769/282970916865 | 16.6836% | 3.5956 | $120.12 | Sucker bet | lesson |
| Big | 0.54:1 | 62.1132% | −22999/529230 | 4.3457% | 0.7471 | $31.29 | Fair | lesson |
| Small | 1.5:1 | 37.8868% | −19571/370461 | 5.2829% | 1.2128 | $38.04 | Poor bet | lesson |
| Super 6 side bet | 12:1 | 5.3864% | −90046773893/300384511749 | 29.9772% | — | $215.84 | Sucker bet | lesson |
| Super 6 side bet | 15:1 | 5.3864% | −539594847041/3904998652737 | 13.8181% | — | $99.49 | Sucker bet | lesson |

### 6.3 Six decks (lesson 12 and the Settings note; not a simulator option)

| Bet | Exact EV per $1 | Edge |
|---|---|---|
| Banker | −460294100/43594702723 | 1.0558% |
| Player | −18880657128/1525814595305 | 1.2374% |
| Tie 8:1 | −220299549488/1525814595305 | 14.4382% |
| Tie 9:1 | −15048464435/305162919061 | 4.9313% |
| EZ Banker | −15503689966/1525814595305 | 1.0161% |
| Super 6 Banker | −716053792/49219825655 | 1.4548% |
| Dragon 7 | −116056364451/1525814595305 | 7.6062% |
| Panda 8 | −11980441901/117370353485 | 10.2074% |
| Dragon Bonus Player / Banker | −1162894363/43594702723 / −143257663701/1525814595305 | 2.6675% / 9.3889% |
| Pair 11:1 | −35/311 | 11.2540% |
| Either Pair 5:1 | −721753/4965115 | 14.5365% |
| Perfect Pair 25/200 | −124550/993023 | 12.5425% |

### 6.4 Outcome probabilities (8 decks)

| Event | Exact | ≈ |
|---|---|---|
| Banker wins | 8954111587648/19524993263685 | 45.8597% |
| Player wins | 8712962041376/19524993263685 | 44.6247% |
| Tie | 619306544887/6508331087895 | 9.5156% |
| Banker wins, ties excluded | 279815987114/552096050907 | 50.6825% |
| A natural on either side | 158222458/461223945 | 34.3049% |
| Player draws | 15479099/30748263 | 50.3414% |
| Banker draws | 4136876519/9501213267 | 43.5405% |
| Four cards dealt / five / six | 140356/370461 · 411869680/1357316181 · 3018415175/9501213267 | 37.8868% · 30.3444% · 31.7687% |
| Banker wins with a three-card 7 | 19129247848/848912750595 | 2.2534% |
| Player wins with a three-card 8 | 674456106496/19524993263685 | 3.4543% |
| Banker wins with a 6 (any) / two-card 6 | 210337737856/3904998652737 · 1769445112/47506066335 | 5.3864% · 3.7247% |
| Natural tie | 1648498/92244789 | 1.7871% |
| Player / Banker wins with a natural | 74989984/461223945 each | 16.2589% |

---

## 7. Strategy and system reference

### 7.1 Auto-play presets (D9; definitions for `strategy/`)

Every preset bets one main bet per hand (`bet`, default `banker`), with a unit `unit` (cents), and optional
fixed side bets `side: {betId: cents}` on every hand. Ties leave a progression unchanged (the bet is
repeated). "Win" and "loss" refer to the main bet. When a progression would exceed the table maximum or
the bankroll, it **resets to its first step** (Martingale, Fibonacci, Labouchère) or **stays at its cap**
(D'Alembert). A session ends at the requested hands or when the next bet can't be covered (bust).

| id | Bets | Rule |
|---|---|---|
| `flat-banker` / `flat-player` / `flat-tie` | 1 unit | Same bet every hand on that spot. |
| `follow-the-shoe` | 1 unit | Bet the side that won the last **decided** hand (ties skipped). First hand of a shoe: Banker. |
| `martingale` | 1, 2, 4, … 64 units | Double after a loss. Back to 1 after a win. After 7 straight losses (or when the next bet is over the limit), back to 1. |
| `paroli` | 1, 2, 4 units | Next step after a win. After the third win, or any loss, back to 1. |
| `one-three-two-six` | 1, 3, 2, 6 units | Next step after a win. After the fourth win, or any loss, back to 1. |
| `fibonacci` | 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89 units | A loss moves one step forward, and a win two steps back (not below the first). A loss on 89 resets to the first step. |
| `dalembert` | 1–20 units | +1 unit after a loss, −1 after a win, between 1 and 20. |
| `labouchere` | line 1-2-3-4 | Bet the first + last numbers (one number left: bet it). A win crosses them off, and a loss appends the amount bet. An empty line restarts at 1-2-3-4. A bet over 100 units restarts the line, betting 5. |

The app's default limits ($5 minimum, $5,000 maximum) allow every preset at a $10 unit (largest bets: Martingale $640,
Labouchère $1,000).

### 7.2 Exact costs (72-hand fresh session, $10 unit)

E[average bet] is computed exactly by forward dynamic programming over each system's states (§12).
Cost = 10 × E[total bet] × edge. Labouchère is simulated (200,000 sessions, ≈).

| Preset | Banker: avg bet (units) | Banker: $/h | Player: avg bet | Player: $/h |
|---|---|---|---|---|
| flat | 1.0000 | $7.62 | 1.0000 | $8.89 |
| follow-the-shoe | 1.0000 | ≈ $8.25 (mix 50.68% Banker) | — | — |
| paroli | 1.7129 | $13.05 | 1.6931 | $15.06 |
| one-three-two-six | 1.9980 | $15.22 | 1.9693 | $17.51 |
| fibonacci | 2.4565 | $18.71 | 2.6983 | $23.99 |
| martingale | 3.3236 | $25.32 | 3.5118 | $31.23 |
| dalembert | 4.5735 | $34.84 | 5.0061 | $44.52 |
| labouchere | ≈ 12.46 | ≈ $94.93 | ≈ 13.31 | ≈ $118.36 |

Steady-state averages (a session that never restarts) are higher. For example, Martingale on Banker
is 3.4301 units ($26.13/h), and D'Alembert on Banker is 9.5967 ($73.10/h). The app always quotes the fresh-session
figures above, which match what auto-play reports at 72 hands.

Martingale facts (7 steps): P(7 straight losses, ties excluded) on Banker = (P(P)/(P(B)+P(P)))⁷ ≈ 0.7096% (1 in 140.9);
on Player ≈ 0.8590% (1 in 116.4). On Banker, a win after k losses nets 1 − 0.05·2ᵏ units: negative from k = 5.

### 7.3 Card counting (lesson 17; ≈ simulated with exact per-hand EV)

3,000 shoes of 8 decks with burn and a cut card at 16 (D8), 239,739 hands (≈ 79.9 per shoe). The exact EV
before every hand was computed from the unseen cards.

| Bet | Hands with +EV | Average EV when +EV | Gain per hand if you bet 1 unit only then |
|---|---|---|---|
| Banker | 0.113% | +0.32% | 0.000004 units |
| Player | 0.103% | +0.40% | 0.000004 units |
| Tie 8:1 | 0.070% | +4.5% | 0.00003 units |
| Dragon 7 | 11.0% | +6.4% | 0.0071 units |
| Panda 8 | 4.6% | +6.1% | 0.0028 units |
| Dragon 7 with the count (true count ≥ +4) | 8.7% of hands bet | +7.03% per bet | ≈ 0.0061 units |

---

## 8. How EV is shown

Learner-facing copy is in quotation marks. Everything else is guidance for implementers. Tier names follow
crappy and holdumb.

### 8.1 The EV sheet (one per bet spot)

Opened by long-press or the "EV" affordance on a spot, and automatically before confirming a Sucker bet. For
the chips about to be placed (or one table unit if the spot is empty), it shows:

1. **EV in dollars and the edge**: "**Banker $10**: **−$0.11** per hand · house edge **1.06%**". Dollars are shown
   to the cent, and the edge to two decimals (three in More → Bets).
2. **Tier badge** with its text label (§8.2), plus "**Lowest edge on this table**" on the cheapest main bet
   for the current variant. That's Banker for `punto-banco` and `ez`, and Player for `super-6`.
3. **Per hour**: "About **$7.62 an hour** at 72 hands" (D5; follows Settings).
4. **Better alternative** (only if the tier is worse than the cheapest main bet's): §8.3 copy.
5. **Why?** (expandable): win / push / lose percentages and the paytable. "Wins 45.86% · pushes 9.52% · loses
   44.62%. Pays 1:1 less 5%."
6. With the **Shoe tracker** on (D6), a second line: "**This shoe**: −1.03% (exact for the 214 cards left)". It's
   labelled "this shoe", and the full-shoe line stays first.

Header line in More → Bets and the sheet footer: "**Perfect strategy**: Banker, house edge 1.06% (EZ 1.02%;
Super 6: Player 1.24%)."

Several bets at once: the sheet footer totals "**This hand**: −$0.82 expected · about $59.31 an hour" ($10 Banker + $5 Tie) (Σ bet × edge).

### 8.2 Wager tiers (house edge per hand)

| Tier id | Edge | Badge text | Colour | Confirm | Bets |
|---|---|---|---|---|---|
| `free` | ≤ 0 | "**Player advantage**" | teal | one tap | Only possible on the Shoe tracker line, never in the full-shoe sheet |
| `good` | ≤ 2% | "**Good bet**" | green | one tap | Banker (all variants), Player |
| `fair` | ≤ 5% | "**Fair**" | yellow | one tap | Dragon Bonus Player; Tie 9:1, Big (lesson only) |
| `poor` | < 9% | "**Poor bet**" | orange | one tap + alternative card | Dragon 7; Perfect Pair 25/200, Small (lesson only) |
| `avoid` | ≥ 9% | "**Sucker bet**" | red | **second tap** ("Bet it anyway") when `confirmCostlyMoves` is on (default on) | Tie 8:1, Pairs, Dragon Bonus Banker, Panda 8; Either Pair, Lucky 6, Super 6 side bet (lesson only) |

Colour never stands alone: every badge has its text, and the tier is in the spot's aria label ("Tie, 8 to 1,
Sucker bet, house edge 14.36%").

### 8.3 Better-alternative copy

| Situation | Copy |
|---|---|
| Player at `punto-banco` / `ez` | "**Banker** is a little cheaper: {edgeB} instead of 1.24%, about {Δ$h} an hour less at this bet." |
| Banker at `super-6` | "**Player** is cheaper at a Super 6 table: 1.24% instead of 1.46%." |
| Tie 8:1 | "**Banker** costs {costB} per hand instead of {costT}. If you love the Tie, look for a 9 to 1 table (4.84%)." |
| Player/Banker Pair | "Pairs pay 11 to 1 but come about 1 in 13.4. **Dragon Bonus on Player** gives big payouts for a quarter of the price (2.65%)." |
| Dragon Bonus Banker | "**Dragon Bonus on Player** pays the same table for 2.65% instead of 9.37%." |
| Dragon 7 | "A 40 to 1 thrill at 7.61%. For the same budget, **Dragon Bonus on Player** costs about a third as much." |
| Panda 8 | "**Dragon 7** is cheaper (7.61% vs 10.19%), and **Banker** far cheaper (1.02%)." |
| Any side bet, tracker shows `free` | "With the cards left, this bet has a **{edge} player advantage** this hand (exact). Casinos limit this; see lesson 17." |

### 8.4 Session panel

* "**Hands** 42 · **Total bet** $520 · **Expected** −$5.65 · **Actual** +$35.00 · **Luck** +$40.65"
* "**Your average edge**: 1.09%" (Σ expected ÷ Σ bet), with "(Banker only: 1.06%)".
* "**Commission paid**: $4.75." At a commission-box variant (chip, §13), this would read "owed".
* In auto-play: the running result with the expected line dashed; for 100 sessions a p10–p90 band plus a survival
  curve (holdumb D32).

Expected = Σ over hands of Σ bet × EV(full shoe). It's always the full-shoe EV, even with the tracker on,
so "Expected" means the same thing everywhere (D6).

### 8.5 Wording rules

* Say "**on average**" and "**expected**". Never "you will win/lose".
* Exact values have no qualifier. Simulated values always carry "≈ … simulated", and normal approximations "≈".
* Never show a negative EV in green just because it's the best bet. The badge says "Lowest edge on this table",
  and the number keeps its sign.
* Never call a betting system or a road pattern a strategy that changes the edge. Never suggest any bet wins in the long run
  on a full shoe.
* Never present the Shoe tracker's "Player advantage" as a recommendation. It's information, with the lesson 17 caveat.
* Card values in prose: "a ten-value card (10, J, Q, K) counts 0".

---

## 9. Drill: the third-card trainer and "which bet?" spots

Drill (`#/drill`, D11) is a quick-fire trainer. Spot generation is a pure seeded function in
`src/sim/strategy/drill.ts`. It deals from a fresh 8-deck shoe composition and keeps a spot only if it matches
the category filter. Each spot shows the cards so far (a staged deal), asks one question with two or three big
buttons, and grades at once. Wrong answers show the deciding **rule row** highlighted in the tableau card, with a
link to the lesson. `?cat=mixed` draws categories in proportion to how often they arise in real play.
`?focus=misses` replays missed spots.

### 9.1 Categories

| id | Question | Buttons | Filter | Pinned example (answer) |
|---|---|---|---|---|
| `hand-total` | "What's the {Player/Banker} total?" | 0–9 keypad | any 2 or 3 cards | {{9c 6d}} → 5 |
| `natural` | "Does anybody draw?" | "Natural, nobody draws" / "Someone draws" | two cards each; 50% naturals | {{4s 5d}} vs {{Qh 8c}} → Natural |
| `player-draw` | "Does the Player draw?" | Draws / Stands | no natural | {{Qs 6h}} → Stands |
| `banker-player-stood` | "Does the Banker draw?" | Draws / Stands | Player stood on 6–7 | Player 7, Banker {{4h Jd}} → Draws |
| `banker-0-2` | same | same | Player drew, Banker 0–2 | Banker 2, P3 = 9 → Draws |
| `banker-3` | same | same | Player drew, Banker 3; P3 = 8 in 30% of spots | Banker 3, P3 = 8 → Stands |
| `banker-4` | same | same | Player drew, Banker 4; P3 = 0/1/8/9 in 50% | Banker 4, P3 = 1 → Stands |
| `banker-5` | same | same | Player drew, Banker 5; P3 = 3 or 8 in 40% | Banker 5, P3 = 3 → Stands |
| `banker-6` | same | same | Player drew, Banker 6; P3 = 5, 6, 7, 8 in 60% | Banker 6, P3 = 7 → Draws |
| `banker-7` | same | same | Player drew, Banker 7 | Banker 7, P3 = 6 → Stands |
| `banker-mixed` | same | same | any Banker decision (the main mode) | — |
| `who-wins` | "Who wins?" | Player / Banker / Tie | whole hand shown at once, unresolved | P {{2h 3c 4d}}, B {{Td 7h}} → Player |
| `settle` | "What's this bet paid?" | 3 amounts | Banker win (commission), Tie, Pair, Dragon Bonus | $25 Banker wins → $23.75 |
| `which-bet` | "Which bet costs less?" | the two bets | pinned spots, §9.3 | Super 6: Banker vs Player → Player |

Weighting in `banker-*` makes the tricky boundary cells (Banker 3 vs 8, 4 vs 0/1, 5 vs 3, 6 vs 5) appear often
enough to learn. `banker-mixed` uses natural frequencies.

### 9.2 Grading copy

| Result | Headline | Body |
|---|---|---|
| correct | "**Correct!**" | "{reminder}" |
| wrong | "**Not quite.**" | "{answer}. {reminder}" (the rule row is highlighted below) |
| `which-bet` correct | "**Correct!**" | "{bet} {edgeA} vs {bet} {edgeB}: about {Δ$h} an hour less at $10." |
| `which-bet` wrong | "**The other one.**" | same body |

`{reminder}` per category:

| Category | Reminder |
|---|---|
| `hand-total` | "Tens and faces are 0. Keep only the last digit." |
| `natural` | "An 8 or 9 on two cards, on either side, ends the hand." |
| `player-draw` | "Player: 0 to 5 draws, 6 and 7 stand." |
| `banker-player-stood` | "Player stood, so the Banker copies the rule: 0 to 5 draws." |
| `banker-0-2` | "Banker 0, 1 or 2 always draws." |
| `banker-3` | "Banker 3 draws on anything except a Player 8." |
| `banker-4` | "Banker 4 draws on a Player third card of 2 to 7." |
| `banker-5` | "Banker 5 draws on 4 to 7." |
| `banker-6` | "Banker 6 draws on 6 or 7 only." |
| `banker-7` | "Banker 7 always stands." |
| `banker-mixed` | the row's reminder |
| `who-wins` | "Closest to 9 wins. Equal totals tie." |
| `settle` | "Banker wins pay 95¢ per $1. Tie pays 8 to 1. Pairs 11 to 1." |

Stats: streak and accuracy per category. "Review misses" replays wrong spots. A per-row heat map of the Banker table
shows accuracy per (Banker total, Player third card) cell, as text percentages in each cell, never colour alone.

### 9.3 Pinned "which bet?" spots

| Table | A | B | Answer | Edges |
|---|---|---|---|---|
| standard | Banker | Player | Banker | 1.06% vs 1.24% |
| super-6 | Banker | Player | Player | 1.46% vs 1.24% |
| standard vs EZ | Banker (5%) | EZ Banker | EZ Banker | 1.06% vs 1.02% |
| standard | Tie 8:1 | Dragon Bonus Banker | Dragon Bonus Banker | 14.36% vs 9.37% |
| standard | Player Pair | Dragon Bonus Player | Dragon Bonus Player | 10.36% vs 2.65% |
| EZ | Dragon 7 | Panda 8 | Dragon 7 | 7.61% vs 10.19% |
| any | Tie 9:1 | Dragon 7 | Tie 9:1 | 4.84% vs 7.61% |
| any | Big | Small | Big | 4.35% vs 5.28% |
| any | Perfect Pair 25/200 | Either Pair 5:1 | Perfect Pair | 8.05% vs 13.71% |
| 4% table vs EZ | Banker 4% | EZ Banker | Banker 4% | 0.60% vs 1.02% |
| per hour | $25 Banker | $10 Player + $5 Tie | $25 Banker | $19.04/h vs $60.58/h |
| per hour | $10 Martingale (Banker) | $25 flat Banker | $25 flat Banker | $25.32/h vs $19.04/h |

---

## 10. How EV is computed in the app (recommendation)

| Quantity | Method | Cost |
|---|---|---|
| Full-shoe EV of every bet, every variant | **Constants** in the payout registry tests (§11), *and* recomputable by the same enumerator as the tracker (one call per variant at startup is cheap, so it's a test, not a table) | 0 |
| Shoe tracker (D6) | **Exact enumeration** of the tableau over 10 point classes of the **unseen** cards: P1, B1, P2, B2, then P3, B3 only where the rule draws. Integer weights are products of remaining counts. With ≤ 416 cards, every weight and every outcome-class sum is ≤ 416·415·414·413·412·411 ≈ 5.0 × 10¹⁵ < 2⁵³ ≈ 9.0 × 10¹⁵, so **plain JS numbers are exact**. Accumulate integer weights per outcome class (winner × totals × card counts × natural flag, 205 classes for a full shoe), then turn them into `bigint` fractions for the payouts. Pairs use the 13-rank composition: P(pair) = Σ nᵣ(nᵣ−1) / (N(N−1)). | Python: 0.19 s per composition; JS est. 5–20 ms on a mid-range phone. Run in the worker after each hand. |
| Drill, scenes | Engine settlement only | — |
| Auto-play / systems | Simulation for paths and bands; exact expected costs from §7.2 constants (DP), labelled "Expected" | — |

Edge cases: the tracker must handle compositions too small to finish a hand (it's only shown while ≥ 6 cards
remain, and the cut card guarantees ≥ 16). Burn cards stay unseen (§5 lesson 17 math box). The tracker shows the
**decks-remaining true count** for Dragon 7 only as a lesson aside, not in the UI (chip).

---

## 11. Exact values for unit tests

```
# tableau (8 decks): ordered deals of up to 6 cards, denominator 416·415·414·413·412·411 = 4998398275503360
counts: Banker 2292252566437888, Player 2230518282592256, Tie 475627426473216
P(B) = 8954111587648/19524993263685 ; P(P) = 8712962041376/19524993263685 ; P(T) = 619306544887/6508331087895
P(B | decided) = 279815987114/552096050907
P(natural either side) = 158222458/461223945 ; P(player draws) = 15479099/30748263 ; P(banker draws) = 4136876519/9501213267
P(4 cards) = 140356/370461 ; P(5) = 411869680/1357316181 ; P(6) = 3018415175/9501213267
P(player 3 cards, banker 2) = 252089488/1357316181 ; P(player 2, banker 3) = 39776/337893
P(dragon 7: banker wins, 3-card 7) = 19129247848/848912750595
P(panda 8: player wins, 3-card 8) = 674456106496/19524993263685
P(banker wins with 6) = 210337737856/3904998652737 ; two-card 1769445112/47506066335 ; three-card 46349535464/2789284751955
P(natural tie) = 1648498/92244789 ; P(player natural win) = P(banker natural win) = 74989984/461223945
P(player non-natural win by m), m=1..9:
  1227969821264/19524993263685, 197575198136/3904998652737, 837074009176/19524993263685, 6948673816/185952316797,
  129819660928/3904998652737, 183904814216/6508331087895, 69992391776/3904998652737, 44397975968/6508331087895,
  71911842832/19524993263685
P(banker non-natural win by m), m=1..9:
  1325771292784/19524993263685, 1137083546056/19524993263685, 969691471144/19524993263685, 87303458024/2169443695965,
  40957261024/1301666217579, 3449076168/144629579731, 310613669056/19524993263685, 110566768688/19524993263685,
  60118526992/19524993263685
outcome classes (ptot, btot, pcards, bcards, natural) with nonzero weight: 205

# 6 decks: denominator 878869206895680 ; counts B 403095751234560, P 392220492728832, T 83552962932288
# 1 deck: denominator 14658134400 ; counts B 6737232640, P 6548674432, T 1372227328

# EV per 1 unit (8 decks)
player        −241149546272/19524993263685   (−1.2351%) ; ties excluded −7535923321/552096050907
banker 5%     −114753351728/10847218479825   (−1.0579%) ; ties excluded −21516253449/1840320169690
banker 4%     −2925372930848/488124831592125 (−0.5993%)
banker 0%     +241149546272/19524993263685
breakeven commission = 7535923321/279815987114 (2.6932%)
ez banker     −66274384744/6508331087895     (−1.0183%) ; ties excluded −24852894279/2153387616065
super6 banker −284694798368/19524993263685   (−1.4581%) ; ties excluded −8896712449/552096050907
tie 8:1       −103841353768/723147898655     (−14.3596%)
tie 9:1       −63053127805/1301666217579     (−4.8440%)
pair 11:1     −43/415 ; P(pair) = 31/415 ; P(both pairs) = 65999/11826255
either 5:1    −108091/788417 ; P(either) = 340163/2365251
perfect 25/200 −135952/1689465 ; perfect 25 only −220127/1689465 ; P(≥1 perfect) = 56513/1689465 ; P(both) = 481/1689465
dragon 7      −64613588827/848912750595      (−7.6113%)
panda 8       −153010345753/1501922558745    (−10.1876%)
dragon bonus player −103547854751/3904998652737 (−2.6517%)
dragon bonus banker −9683026823/103306842665     (−9.3731%)
lucky 6 (12/20)     −47209656769/282970916865    (−16.6836%)
big (0.54)    −22999/529230 ; small (1.5) −19571/370461
super 6 side 12:1 −90046773893/300384511749 ; 15:1 −539594847041/3904998652737

# EV per 1 unit (6 decks)
player −18880657128/1525814595305 ; banker −460294100/43594702723 ; tie8 −220299549488/1525814595305
tie9 −15048464435/305162919061 ; ez banker −15503689966/1525814595305 ; super6 banker −716053792/49219825655
dragon7 −116056364451/1525814595305 ; panda8 −11980441901/117370353485
dragon bonus player −1162894363/43594702723 ; banker −143257663701/1525814595305
pair −35/311 ; either −721753/4965115 ; perfect 25/200 −124550/993023

# shoe tracker (8 decks, compositions by point value [0..9])
one 7 removed: banker −2344783820668/219924374673375 ; player −419731067296/34210458282525
[17,4,5,5,5,5,5,5,0,1] (52 cards): dragon7 +59135759/183226680 (+32.275%) ; panda8 −18323/391510 ;
   banker −306007601/24430224000 ; player −142117/14094360 ; tie8 −9874393/203585200
[16,4,4,4,0,4,8,4,4,4] (52 cards): banker −10635473/2290333500 (−0.464%) ; player −2101592/114516675
[16,4,4,4,9,4,1,2,4,4] (52 cards): player −18929/18322668 (−0.103%) ; panda8 +549953/70471800 (+0.780%)

# hourly (72 hands, $10): banker $7.62 ; player $8.89 ; tie $103.39 ; ez $7.33 ; super6 $10.50 (to the cent)
# systems (Banker, fresh 72-hand session, unit 1): E[avg bet] flat 1 ; paroli 1.7129 ; 1-3-2-6 1.9980 ;
#   fibonacci 2.4565 ; martingale 3.3236 ; dalembert 4.5735   (tolerance 1e-4; exact via DP in the test)
# martingale (Banker, 7 steps): P(7 losses | decided) = (8712962041376/17667073629024)^7 ≈ 0.0070959
# scenes: deals.py outcomes (§12.3) are asserted by the scene runner test
```

---

## 12. Verification notes and sources

### 12.1 Method

* **Tableau enumeration** (`tableau.py`): all ordered sequences P1, B1, P2, B2 (10 point classes, weights = remaining
  counts), then P3 and B3 only where the rule draws. Every outcome is scaled to the common denominator
  N(N−1)…(N−5), so all arithmetic is integer. Checked: weights sum to the denominator. The 8-deck counts
  (B 2,292,252,566,437,888 / P 2,230,518,282,592,256 / T 475,627,426,473,216) match the widely published
  combinatorial table.
* **Bets** (`bets.py`): each payout is a function of (Player total, Banker total, card counts, natural). Pairs are computed
  combinatorially at rank and suit level.
* **Effects of removal** (`eor.py`): exact EV with one card of each value removed. The count-weighted sum of the effects is 0 (checked).
* **Systems** (`systems.py`, `sessions.py`): Markov chains in exact rationals (Gaussian elimination for the steady state, and forward
  DP over 72 hands for fresh sessions). Labouchère is Monte Carlo.
* **Bankroll survival** (`ruin.py`): DP over bankroll in 5¢ steps, with independent hands.
* **Streaks** (`streaks.py`): DP for runs in 73 decided hands, independent with P(B | decided), plus a Monte Carlo
  average of the longest run.
* **Shoe study** (`shoe_burn.c`): 3,000 shoes, xorshift RNG, burn by first card, cut at 16. Exact EV (double precision)
  before each hand from the unseen composition.
* **Scenes** (`deals.py`): every forced deal is replayed through the tableau. A third card must be present exactly when drawn, and
  the totals and winner are as described.

### 12.2 Published figures these agree with

The main-bet edges (1.06%, 1.24%, 14.36%, 4.84%), EZ Banker 1.02%, Super 6 Banker 1.46%, Dragon 7 7.61%, Panda 8 10.19%,
Dragon Bonus 2.65% / 9.37%, Pair 10.36% / 11.25%, Either Pair 13.71%, Big 4.35% and Small 5.28% agree with the figures
commonly published (Wizard of Odds baccarat pages; Thorp & Walden's 1966 analysis of baccarat card counting, whose conclusion
lesson 17 restates; Jacobson's Dragon 7 count). These were checked from the spike's knowledge, not fetched. **Every number in
this file was recomputed here, and the recomputation is the authority.**

### 12.3 Scene deals (machine-checked)

| Scene | Player | Banker | Result |
|---|---|---|---|
| l01-s2 | Kh 7d | 5s Qc Ah | P 7, B 6: Player |
| l02-s1 | 9c 6d 3h | Kd Jh 7s | P 8, B 7: Player |
| l03-s1 | 4s 5d | Qh 8c | natural 9 v 8: Player |
| l03-s2 a | 2h 3c 4d | Td 7h | P 9, B 7: Player |
| l03-s2 b | Qs 6h | 3d 2s 3c | P 6, B 8: Banker |
| l04-s1 a, l23-s1 | 7c Kh | 4h Jd 5c | P 7, B 9: Banker |
| l04-s1 b | 3s 3h | 6d Ks | 6–6: Tie |
| l05-s1 (5 hands) | Ah 2c 8s / Kd 4c 2h / 5h Tc 3d / Ks Jh 7c / Qd 2s 5s | Jc 3d / Qs 4s 3h / 2d 3s / 4d 2c 2s / 3h 3c | B 3–1 / B 7–6 / P 8–5 / B 8–7 / P 7–6 |
| l07-s1 | 2d Kh Jc | 7s Qd | P 2, B 7: Banker |
| l07-s2 | Kc 6s | 2h 4h | 6–6: Tie |
| l12-s1 (EZ) | Kc 5d Th | Ad 2h 4c | B wins with a three-card 7: Banker push |
| l12-s2 (Super 6) | Qh 4d Kh | 3c 3s | B 6–4: pays 1:2 |
| l20-s1 | Ac Ad 7h | Kc Qc Jh | P 9, B 0, non-natural: pair + DB 30:1 |
| l21-s1 (EZ) | 2c Kd 6d | Qd 5h Ts | P three-card 8 vs 5: Panda 8 |

Prediction steps with random deals (l06-s1, l13-s1, l24-s1) use fixed seeds. Their wording doesn't depend on the cards.

---

## 13. Assumptions and open points for decisions.md

1. **Primary metric**: house edge per hand, ties as pushes (§3). Ties-excluded appears only in lesson 13/14 copy.
   Recommend recording it as a decision.
2. **Scene schema**: §1.2 names (`deals` with player/banker arrays, `pauseAt`, `predict`, `predicted`, `shoe.remaining`,
   `history`, `ui.roads`, `ui.shoeTracker`, `tapped: commission|bead-plate|big-road|shoe-tracker|session`). These were sent to main for
   the simulator spike. If simulator.md differs, it's mapped like holdumb D25.
3. **Predict buttons**: `player-draws` and `banker-draws` show "Draws" / "Stands", plus "Natural, nobody draws" when paused at
   `two-cards`. `hand-total` shows a 0–9 keypad. `winner` shows Player / Banker / Tie.
4. **Cut card**: the hand in progress finishes, plus **one more hand** (common casino practice). The simulator owns this.
   The shoe study (§7.3) stopped dealing at the cut card, which changes nothing material.
5. **Commission** is taken at settlement (D2 says 5%; amounts are always exact cents because bets are whole dollars; for
   odd-cent amounts, recommend **round the commission down to the cent**, in the player's favour). A commission-box mode is a chip.
6. **Labouchère** has no exact figure (simulated, ≈). The other systems are exact by DP. Auto-play's "Expected" line for systems
   should use Σ bet × edge over the bets actually placed, which is exact per run.
7. **Follow-the-shoe** cost (≈ $8.25/h) treats hands as independent. The auto-play run reports its own exact expected value.
8. **Lesson 17 scene l17-s2** needs `shoe.remaining` support (a 52-card EZ composition with no 8s). If the simulator can't start a
   shoe from a composition, the fallback is a forced sequence of earlier hands, which is much slower.
9. **Squeeze** is described in lesson 23 only (D7). No scene or setting uses it.
10. **Mentioned-only bets** (§2.4) have no engine ids. More → Bets lists them in a "Not in this app" section with the edges in §6.2.
11. **Table limits** in §2.1 ($5–$5,000; side bets $1–$500) are a proposal. Lessons 19 and 22 need the $5,000 maximum (Labouchère
    reaches $1,000).
12. **Chips (deferred)**: a commission-box mode; Dragon 7 true-count display in the tracker; derived roads drawn (D4 says
    explained only); 6-deck shoe option; Tie 9:1 paytable option; Lucky 6 / Big-Small simulation.
