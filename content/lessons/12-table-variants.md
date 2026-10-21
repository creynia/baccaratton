---
id: table-variants
title: "Choosing a table: commission, EZ and Super 6"
chapter: perfect-lowest-edge
summary: "No-commission tables, 4% tables, 6 decks and 9:1 ties: which is cheapest."
minutes: 7
---

Many casinos now advertise **no-commission** baccarat. There's no free lunch: each version takes
the 5% back in a different way.

**EZ Baccarat** (`ez`). Banker wins pay **1:1**, except when the Banker wins with a **three-card 7**
(the "Dragon 7"). Then the Banker bet **pushes**. That happens about once every 44 hands. The Banker edge
is **1.02%**, a hair **better** than the commission game's 1.06%. EZ tables also offer two famous side
bets, Dragon 7 and Panda 8 (lesson 21).

**Super 6 / Punto 2000** (`super-6`). Banker wins pay **1:1**, except when the Banker wins with a total of
**6**. Then it pays only **half** (1 to 2). That happens about once every 19 hands, and it costs more than
it looks: the Banker edge is **1.46%**, worse than both the commission game and the Player bet.

Every option, cheapest first (8 decks unless noted):

| Table | Banker edge | Player edge | Banker, $10 for an hour |
|---|---|---|---|
| 4% commission (rare) | 0.60% | 1.24% | $4.31 |
| EZ Baccarat | **1.02%** | 1.24% | $7.33 |
| 6 decks, 5% commission | 1.06% (1.0558%) | 1.24% (1.2374%) | $7.60 |
| **8 decks, 5% commission (default)** | **1.06%** (1.0579%) | 1.24% (1.2351%) | **$7.62** |
| Super 6 | 1.46% | 1.24% | $10.50 |

At a **Super 6** table, Player (1.24%) is the cheapest main bet. Everywhere else it's Banker. The number of
decks barely matters for the main bets. It matters more for Pairs (lesson 20).

Also check the **Tie**: 9 to 1 (4.84%) instead of 8 to 1 (14.36%) is a big improvement if you like the bet.

:::math EZ and Super 6, exactly (8 decks)
P(Banker wins with a three-card 7) = 19129247848/848912750595 ≈ 2.2534% (1 in 44.4).
EZ Banker: EV = P(Banker) − P(Dragon 7) − P(Player) = −66274384744/6508331087895 ≈ **−1.0183%**.
P(Banker wins with a 6) = 210337737856/3904998652737 ≈ 5.3864% (1 in 18.6).
Super 6 Banker: EV = P(Banker) − ½ × P(Banker wins with 6) − P(Player) = −284694798368/19524993263685 ≈ **−1.4581%**.
:::

```scene
id: l12-s1
version: 1
title: EZ Baccarat's Dragon 7
variant: ez
bankroll: 50000
allowedBets: [banker]
showEV: true
steps:
  - id: bet
    text: "This is an **EZ Baccarat** table. Put **$10 on Banker** and open its EV sheet: 1.02%, no commission."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: banker, minAmount: 1000 } }, { previewed: { bet: banker } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Kc, 5d, Th], banker: [Ad, 2h, 4c] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Banker won 7 to 5 **with three cards**: a Dragon 7. In EZ that win **pushes**, so your $10 comes back and nothing more."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l12-s2
version: 1
title: Super 6
variant: super-6
bankroll: 50000
allowedBets: [banker]
showEV: true
steps:
  - id: bet
    text: "A **Super 6** table. Put **$10 on Banker** and open its EV sheet: **1.46%**, more than the Player bet here."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: banker, minAmount: 1000 } }, { previewed: { bet: banker } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Qh, 4d, Kh], banker: [3c, 3s] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Banker wins **6** to 4. At Super 6 that pays half: **+$5** instead of $10."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: At an EZ Baccarat table, what happens when Banker wins with a three-card 7?
  options: ["Banker pays 40 to 1", "Banker bets push", "Banker pays half", "Banker bets lose"]
  answer: 1
  explain: "That's the trade-off for paying 1:1 without commission."
- q: Which table gives the Banker bet the highest edge?
  options: ["EZ Baccarat", "8 decks, 5% commission", "Super 6", "4% commission"]
  answer: 2
  explain: "Super 6: 1.46%, worse than the Player bet's 1.24%."
- q: At a Super 6 table, what's the lowest-edge main bet?
  options: ["Banker", "Player", "Tie"]
  answer: 1
  explain: "Player is 1.24% everywhere, and Super 6 Banker is 1.46%."
- q: Does a 6-deck shoe change the Banker edge much?
  options: ["Yes, it halves it", "No: 1.0558% vs 1.0579%", "Yes, it doubles it", "Banker can't be played with 6 decks"]
  answer: 1
  explain: "The number of decks hardly matters for the main bets."
```
