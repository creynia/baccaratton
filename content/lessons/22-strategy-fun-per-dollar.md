---
id: strategy-fun-per-dollar
title: "Perfect strategy III: the most fun per dollar"
chapter: perfect-fun
summary: "Spend your budget where the thrills are cheapest."
minutes: 7
---

Not everybody plays to lose as little as possible. Many people play for the big moments: a 30 to 1
Dragon Bonus, a tie at 8 to 1, a run of Paroli wins. That's fine. This chapter is about **getting the most
of those moments for each dollar the evening costs**.

Here's what each $5 side bet buys in an hour (72 hands), next to what it costs:

| $5 side bet | Big win | Big wins per hour (avg) | Cost per hour |
|---|---|---|---|
| Dragon Bonus, Player | 30:1 / 10:1 / 6:1 (wins by 9, 8, 7) | 2.0 (all three) | **$9.55** |
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
    allowedActions: []
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
