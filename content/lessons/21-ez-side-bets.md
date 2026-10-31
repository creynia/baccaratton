---
id: ez-side-bets
title: "Dragon 7, Panda 8 and the rest of the side bets"
chapter: perfect-fun
summary: "The EZ table's two famous bets, plus a tour of side bets you'll meet elsewhere."
minutes: 7
sources:
  - woo-ez-baccarat
  - woo-baccarat-side-bets
  - woo-lucky-6
---

**Dragon 7** (EZ only) wins when the **Banker wins with a three-card 7**: the same hand that makes EZ Banker
bets push. Pays **40 to 1**. It happens about once in 44 hands, so a fair payout would be about 43.4 to 1.
Edge: **7.61%**.

**Panda 8** (EZ only) wins when the **Player wins with a three-card 8**. Pays **25 to 1**. It happens about once
in 29 hands (fair would be about 28 to 1). Edge: **10.19%**.[^1]

Dragon 7 is the bet card counters target (lesson 17). Off the count, it's just an expensive thrill.

**Other side bets you'll meet** (not in the app's simulator; paytables vary, so check the sign):[^2][^3]

| Bet | Wins when | Typical pay | Edge (8 decks) |
|---|---|---|---|
| Either Pair | Either hand starts with a pair | 5:1 | 13.71% |
| Perfect Pair | Either hand starts with a **suited** pair | 25:1 (200:1 both) | 8.05% |
| Lucky 6 | Banker wins with a 6 | 12:1 two cards, 20:1 three cards | 16.68% |
| Big | The hand uses 5 or 6 cards | 0.54:1 | 4.35% |
| Small | The hand uses exactly 4 cards | 1.5:1 | 5.28% |
| Super 6 side bet | Banker wins with a 6 | 12:1 (15:1) | 29.98% (13.82%) |
| Tie at 9:1 | Tie | 9:1 | 4.84% |

None of them beats Banker's 1.06%. The best of these are the Big/Small bets and a 9:1 Tie, at 4–5%. The
Super 6 side bet at 12 to 1 is among the worst bets in any casino.

:::math Dragon 7 and Panda 8, exactly (8 decks)
P(Dragon 7) = 19129247848/848912750595 ≈ 2.2534%. EV = 41·P − 1 = −64613588827/848912750595 ≈ **−7.6113%**.
P(Panda 8) = 674456106496/19524993263685 ≈ 3.4543%. EV = 26·P − 1 = −153010345753/1501922558745 ≈ **−10.1876%**.
Lucky 6: P(Banker wins with a two-card 6) ≈ 3.7247%, three-card ≈ 1.6617%; EV ≈ −16.68%.
Big/Small: P(4 cards) = 140356/370461 ≈ 37.887%.
:::

```scene
id: l21-s1
version: 1
title: Panda 8
variant: ez
bankroll: 50000
allowedBets: [player, panda-8, dragon-7]
showEV: true
steps:
  - id: bet
    text: "At an EZ table: **$10 on Player** and **$5 on Panda 8**. Open the EV sheet on **Panda 8** and **Dragon 7**. Panda 8 is a Sucker bet, so it takes a second tap: **Bet it anyway**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { all: [ { betOnFelt: { bet: player, minAmount: 1000 } }, { betOnFelt: { bet: panda-8, minAmount: 500 } }, { previewed: { bet: panda-8 } }, { previewed: { bet: dragon-7 } } ] }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [2c, Kd, 6d], banker: [Qd, 5h, Ts] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Player drew a 6 to make **8 with three cards**, and the Banker drew a ten and stayed on 5. **Panda 8 pays 25 to 1: +$125**, and the Player bet +$10."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: When does Dragon 7 win?
  options: ["Any Banker 7", "Banker wins with a three-card 7", "Player wins with 7", "A 7-7 tie"]
  answer: 1
  explain: "Three cards, total 7, and the Banker must win."
- q: Which has the lower edge?
  options: ["Dragon 7 (7.61%)", "Panda 8 (10.19%)"]
  answer: 0
  explain: "Both are expensive, and Panda 8 more so."
- q: Which of these side bets is the most expensive?
  options: ["Big", "Perfect Pair", "Lucky 6", "Super 6 side bet at 12:1"]
  answer: 3
  explain: "About 30%."
```
