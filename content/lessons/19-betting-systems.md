---
id: betting-systems
title: "Martingale, Paroli and friends: what they really cost"
chapter: perfect-fun
summary: "No system changes the edge. Most raise your average bet, and with it the hourly cost."
minutes: 10
---

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
| Fibonacci | After a loss, the next number in 1-1-2-3-5-8…89; after a win, back two | $24.56 | $18.71 |
| Martingale | Double after every loss, back to 1 after a win; at most 7 bets ($10–$640) | $33.24 | $25.32 |
| D'Alembert | +1 unit after a loss, −1 after a win (1 to 20 units) | $45.73 | $34.84 |
| Labouchère | Write 1-2-3-4. Bet first + last; a win crosses them off, a loss adds the bet to the end (bets capped at 100 units) | ≈ $125 | ≈ $95 (≈ simulated) |

(Average bets are for a fresh one-hour session, ties included, with the caps shown and a bankroll that doesn't run out. Auto-play's exact line shows these figures for one system; in a comparison, each system's cost comes from the bets it actually placed, so it lands near them.)

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
$720. On Player, the costs are higher (flat $8.89, Martingale $31.23).
:::

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
    allowedActions: []
    completeWhen: { autoPlayCompleted: { minHands: 72 } }
  - id: read
    text: "Compare **cost per hour** with the table above: each system lands near its figure. On average every bet still loses its edge, but over 100 hours the Actual column can wander a long way, even above zero. Martingale shows many small wins and a few deep holes. Labouchère wagers the most by far."
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
