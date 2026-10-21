---
id: variance-and-bankroll
title: "Swings, sessions and bankroll"
chapter: perfect-practical
summary: "In an hour, luck is ten times bigger than the edge."
minutes: 8
---

In the short run, baccarat is all luck. A $10 Banker bet loses about 11 cents on average, but each hand
actually moves you about **$9.27 up or down** (one standard deviation). Over an hour (72 hands):

| $10 Banker, flat | Expected | Typical swing (±1 SD) | Chance to be ahead (≈) |
|---|---|---|---|
| 1 hour | −$7.62 | ±$79 | 46% |
| 10 hours | −$76 | ±$249 | 38% |
| 100 hours | −$762 | ±$787 | 17% |

Luck grows with the **square root** of the number of hands, and the edge grows in a straight line. So
luck dominates a night out, and the edge dominates a lifetime.

Some bets swing much harder than others (SD per $1 bet, per hand): Banker 0.93, Player 0.95,
Dragon Bonus on Player 2.47, Tie 2.64, Pair 3.15, Dragon 7 6.08. Hard swingers give you more big
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
    allowedActions: []
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "The band shows the middle 80% of results, and the survival curve shows how many sessions still had chips. About **8 in 100** run out within 10 hours with $500 (50 bets). The thin expected line ends close to **−$76**: ten hours of the edge."
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
