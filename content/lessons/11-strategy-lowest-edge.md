---
id: strategy-lowest-edge
title: "Perfect strategy I: the lowest edge"
chapter: perfect-lowest-edge
summary: "Bet Banker, flat, every hand. That's the whole optimum."
minutes: 5
---

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

The Banker-vs-Player difference is small: at $10 a hand it's $1.28 an hour. If you prefer Player
for some reason, that's not a disaster. But Tie and most side bets cost **ten times** as much, and that's
where the real money goes. Lesson 17 covers card counting: the one way the edge can move, and why it
almost never helps.

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
  explain: "Player costs $1.28 an hour more than Banker; Tie costs $95.77 more."
```
