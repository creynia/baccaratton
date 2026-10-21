---
id: roads-and-streaks
title: "Scoreboards, streaks and the gambler's fallacy"
chapter: perfect-practical
summary: "The scoreboards record the past. They can't predict the next hand."
minutes: 8
---

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
one card from a fresh 8-deck shoe moves the Banker's EV by at most **0.012%** (removing a 4 helps the Banker most,
removing a 6 hurts it most; lesson 17). The winner of the last hand says almost nothing about which cards were
used, so the effect of a streak is smaller still. The table above assumes independent hands with
P(Banker | decided) = 279815987114/552096050907 ≈ 50.68%, and is a dynamic-programming result.
:::

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
    text: "The sheet shows the fresh-shoe prices (Banker 1.06%, Player 1.24%), and after a streak the real odds are within a few hundredths of a percent of them. Place any $10 bet and deal."
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
