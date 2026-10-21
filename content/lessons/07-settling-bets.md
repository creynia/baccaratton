---
id: settling-bets
title: "Who gets paid: commission, ties and pushes"
chapter: ev-basics
summary: Banker pays 95¢ on the dollar, ties push, and Tie pays 8 to 1.
minutes: 5
---

Every hand ends one of three ways: Player wins, Banker wins, or a tie. Here is what happens to each bet:

| Result | Player bet | Banker bet | Tie bet |
|---|---|---|---|
| Player wins | **Wins 1:1** | Loses | Loses |
| Banker wins | Loses | **Wins 1:1 less 5%** | Loses |
| Tie | **Push** (returned) | **Push** (returned) | **Wins 8:1** |

**[[Commission]].** A winning Banker bet pays 95¢ for each dollar: the casino keeps 5% of the win.

| Banker bet | Win before commission | Commission (5%) | You're paid |
|---|---|---|---|
| $10 | $10 | $0.50 | **$9.50** |
| $20 | $20 | $1.00 | **$19.00** |
| $25 | $25 | $1.25 | **$23.75** |
| $100 | $100 | $5.00 | **$95.00** |

The commission is only charged on **wins**. A losing Banker bet loses the bet and nothing more, and a
[[push]] costs nothing.

**Ties.** A tie isn't a loss for Player or Banker bets. The chips just stay where they are. That's
why many players don't mind ties at all. The **Tie** bet is the one that wins: 8 to 1, so a $5 Tie bet
wins $40 and you keep the $5.

:::tip
In this app the commission comes out of each Banker win as it's paid. At many real tables it doesn't:
the dealer pays the full amount and drops a marker in a numbered **[[commission box]]** for your seat.
You settle it when you leave or when the shoe ends (lesson 23).
:::

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
    text: "Player had 2 and drew a jack: still 2. Banker's 7 stands. **Banker wins**: $20 less $1 commission, so you won **$19**. Tap the **$1.00 commission** line in the payout."
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
