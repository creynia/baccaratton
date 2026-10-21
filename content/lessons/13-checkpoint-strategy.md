---
id: checkpoint-strategy
title: "Checkpoint: rules and the best bet"
chapter: perfect-lowest-edge
summary: The third-card rule and the lowest-edge bet, all together.
minutes: 8
checkpoint: true
---

A quick check before the practical chapter. The first scene deals random hands until you make three right Banker calls, stopping at each Banker
decision for you to call. The second puts you at a table you haven't played yet: place the lowest-edge bet. The quiz mixes everything from
lessons 1–12.

:::math Two ways to quote the same edge
You may see the Banker edge quoted as **1.17%** and Player as **1.36%**. Those figures leave ties out: they
are the loss per bet that was **decided** (won or lost). This app counts every hand you bet, ties
included as pushes, which gives 1.06% and 1.24%. That's the figure that turns straight into money per hand.
Per resolved bet: Banker 21516253449/1840320169690 ≈ 1.1692%, Player 7535923321/552096050907 ≈ 1.3650%.
:::

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
- q: "Player {{5c Kd =5}} draws a {{4s}}. Banker has {{6h 9c =5}}. What does the Banker do?"
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
