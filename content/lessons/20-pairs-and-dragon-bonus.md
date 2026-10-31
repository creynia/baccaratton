---
id: pairs-and-dragon-bonus
title: "Pairs and the Dragon Bonus"
chapter: perfect-fun
summary: "Pairs pay 11:1 but cost 10%. Dragon Bonus on Player is the cheapest side bet."
minutes: 7
sources:
  - woo-baccarat-side-bets
---

Side bets are optional bets placed next to your main bet. They pay more, they hit less, and they cost
more.

**Player Pair / Banker Pair.** Wins if that hand's **first two cards are the same rank**: {{8h 8c}} yes, {{Kd Qd}}
no (different ranks, even though both count 0). Pays **11 to 1**. A pair turns up about once in 13.4
hands per side, so a fair payout would be about 12.4 to 1. At 11 to 1 the edge is **10.36%** with 8 decks, and **11.25%** with 6.
Fewer decks mean fewer cards of each rank, so pairs are rarer.

**Dragon Bonus.** Pick a side (Player or Banker). It pays if your side wins **convincingly**:

| Your side… | Pays |
|---|---|
| wins with a **natural** (8 or 9 on two cards) | 1 to 1 |
| ties with a natural | push |
| wins **without** a natural by **9** points | 30 to 1 |
| … by 8 | 10 to 1 |
| … by 7 | 6 to 1 |
| … by 6 | 4 to 1 |
| … by 5 | 2 to 1 |
| … by 4 | 1 to 1 |
| anything else (smaller win, loss, other tie) | loses |

On **Player** the edge is **2.65%**, the cheapest side bet in this app. On **Banker** it's **9.37%**, matching the Wizard of Odds analysis.[^1]
Why the difference? The Banker's drawing rule wins a lot of **close** hands, and close wins don't
pay here. When the Player wins, it wins by a wide margin a bit more often.

| Side bet | Edge | $5 a hand for an hour |
|---|---|---|
| Dragon Bonus, Player | 2.65% | $9.55 |
| Dragon Bonus, Banker | 9.37% | $33.74 |
| Player Pair or Banker Pair | 10.36% | $37.30 |

:::math Dragon Bonus on Player, exactly (8 decks)
P(Player wins with a natural) = 74989984/461223945 ≈ 16.259%. P(natural tie) = 1648498/92244789 ≈ 1.787%.
P(Player wins without a natural by m), m = 4…9: 3.737%, 3.324%, 2.826%, 1.792%, 0.682%, 0.368%.
EV = 1·P(nat win) + Σ payₘ·P(win by m) − P(lose) = −103547854751/3904998652737 ≈ **−2.6517%**.
Pairs: P(pair) = 13 · 32 · 31 / (416 · 415) = 31/415, so EV = 12 × 31/415 − 1 = −43/415 ≈ −10.3614%.
With 6 decks: 23/311, EV −35/311 ≈ −11.2540%.
:::

```scene
id: l20-s1
version: 1
title: A hand that pays three ways
bankroll: 50000
allowedBets: [player, player-pair, dragon-bonus-player]
showEV: true
steps:
  - id: bet
    text: "Bet **$10 on Player**, **$5 on Player Pair** and **$5 on Dragon Bonus (Player)**. Open the EV sheet on each side bet as you place it. Player Pair is a Sucker bet, so it takes a second tap: **Bet it anyway**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: player, minAmount: 1000 } }, { betOnFelt: { bet: player-pair, minAmount: 500 } }, { betOnFelt: { bet: dragon-bonus-player, minAmount: 500 } }, { previewed: { bet: player-pair } }, { previewed: { bet: dragon-bonus-player } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Ac, Ad, 7h], banker: [Kc, Qc, Jh] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "A pair of aces (+$55 on the Pair). Player draws to 9 while the Banker stays on 0, so Player wins **by 9 without a natural**: Dragon Bonus pays 30 to 1, **+$150**. Player +$10. Total **+$215**. Hands like this are why side bets exist. The Dragon Bonus 30 to 1 comes about once in 270 hands."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player's first two cards are {{Kd Qs}}. Does Player Pair win?"
  options: ["Yes, both count 0", "No, they're different ranks"]
  answer: 1
  explain: "A pair means the same rank. K and Q are different, even though both are worth 0."
- q: "Player wins 7 to 2 with three cards each. What does Dragon Bonus on Player pay?"
  options: ["1 to 1", "2 to 1", "4 to 1", "It loses"]
  answer: 1
  explain: "A non-natural win by 5 pays 2 to 1."
- q: Which side bet has the lowest edge on the default table?
  options: ["Player Pair", "Dragon Bonus on Banker", "Dragon Bonus on Player", "Tie"]
  answer: 2
  explain: "Dragon Bonus Player: 2.65%."
- q: "Banker wins 9 to 8 with two naturals. What does Dragon Bonus on Banker pay?"
  options: ["30 to 1", "1 to 1", "Push", "It loses"]
  answer: 1
  explain: "A win with a natural pays 1 to 1, whatever the margin."
```
