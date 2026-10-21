---
id: the-tie-bet
title: "The Tie bet: 8 to 1 isn't enough"
chapter: ev-basics
summary: Ties come about 1 hand in 10.5, so 8 to 1 is short.
minutes: 5
---

Ties feel common, and they are: about **9.5%** of hands, roughly one in every 10.5. So why is the Tie bet
the worst of the three?

Picture 1,000 hands with $1 on Tie each time. About 95 are ties (95.2), each paying $8: about $761 in winnings. The
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
    allowedActions: []
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "Look at each plan's thin expected line. Banker's ends near **−$76**, and Tie's near **−$1,034**. A few Tie evenings still finish ahead: lucky runs of ties happen, but they're the exception."
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
