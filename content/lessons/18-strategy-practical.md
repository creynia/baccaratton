---
id: strategy-practical
title: "Perfect strategy II: a plan you can follow"
chapter: perfect-practical
summary: "Pick the table, the bet size, the session length, and stick to them."
minutes: 6
---

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
| Betting Player instead of Banker | +$1.28 |
| Sitting out every other hand | −$3.81 (saves) |

:::tip
**Comps** (free meals, rooms) are usually worth a fraction of your expected loss. They're a nice extra,
not a reason to bet more.
:::

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
