---
id: edge-and-hourly-cost
title: "House edge, per hand and per hour"
chapter: perfect-practical
summary: "Edge × bet × hands per hour: the number that matters to your wallet."
minutes: 6
---

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

* **Bet size dominates.** Going from $10 to $25 costs $11.43 more an hour. Switching from Banker to Player
  at $10 costs $1.28.
* **Pace matters.** A big table with the squeeze (lesson 23) deals about 40 hands an hour. The same $10
  Banker bet then costs $4.23 an hour. Sitting out hands, chatting and taking breaks all lower the
  hourly cost without changing the edge.

Your edge per bet is the same either way. What changes is how many bets you make.

**One number, defined.** "House edge" in this app always means **expected loss per bet, counting ties as
pushes**. Some books quote the edge "ties excluded" (Banker 1.17%, Player 1.36%), which is the loss per
**decided** bet. Both are correct, but only the first one multiplies straight into dollars per hand. (In
some games there's also an "element of risk" when you can add money mid-hand. Baccarat has no such
bets, so here it equals the house edge.)

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
  explain: "Switching to Player costs $1.28 more. Slowing to 40 hands saves $3.39."
- q: A book says Banker's edge is 1.17%. The app says 1.06%. Who's right?
  options: ["The book", "The app", "Both: the book leaves ties out", "Neither"]
  answer: 2
  explain: "1.17% is per decided bet. 1.06% counts ties as pushes, per bet placed."
```
