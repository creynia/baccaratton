---
id: banker-vs-player
title: Why the Banker wins more often
chapter: ev-basics
summary: Acting last is worth 1.24%, and the commission takes it back and a bit more.
minutes: 6
---

The two hands aren't treated equally. The Player follows a blind rule (0–5 draws). The Banker acts
**after** seeing what the Player did, and in lesson 5 you saw how its table reacts to the Player's third
card. That small information edge means the Banker wins a bit more often:

| Result | How often (8 decks) |
|---|---|
| Banker wins | **45.86%** |
| Player wins | **44.62%** |
| Tie | 9.52% |

Leave out the ties, and the Banker wins **50.68%** of the hands that are decided.

If Banker paid even money, it would be a **winning** bet for you: +1.24%, exactly the mirror of the Player
bet's −1.24%. Casinos fix that with the **5% commission**. A Banker win then pays 95¢, and the bet
goes from +1.24% to **−1.06%**.

So both bets lose in the long run, but the Banker bet loses **less**: about 1.06¢ per dollar against
1.24¢. Paying the commission feels like a cost, and it is, but it's smaller than the price of betting
on the hand that wins less often.

:::math Where the commission sits
With the commission c, EV(Banker) = (1 − c) × P(Banker) − P(Player).
At c = 0: +241149546272/19524993263685 ≈ +1.2351% (exactly minus EV(Player)).
At c = 5%: −1.0579%.
The bet breaks even at c = 1 − P(Player)/P(Banker) = 7535923321/279815987114 ≈ **2.69%**. Some casinos
charge 4%, which gives an edge of 2925372930848/488124831592125 ≈ **0.5993%** (lesson 12).
:::

```scene
id: l09-s1
version: 1
title: Same cards, two bets
bankroll: 1000000
showEV: true
ui: { speed: fast, showSession: true }
autoPlay:
  enabled: true
  handOptions: [720]
  sessions: [1]
  compare:
    - { id: flat-banker, unit: 1000 }
    - { id: flat-player, unit: 1000 }
steps:
  - id: run
    text: "Auto-play **720 hands** (10 hours) twice on the same cards: $10 on Banker every hand, then $10 on Player. Tap **Run**."
    allowedActions: []
    completeWhen: { autoPlayCompleted: { minHands: 720 } }
  - id: read
    text: "Count the wins: Banker wins about 9 more hands per 720 than Player on average, though a single run can go either way. The expected lines end at about **−$76** for Banker and **−$89** for Player. Over 720 hands, luck still moves each result by about ±$250, so your run may look different."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Why does the Banker win more often than the Player?
  options: ["The dealer favours it", "It acts last, with a rule that reacts to the Player's third card", "It gets an extra card", "It doesn't: they win equally"]
  answer: 1
  explain: "The Banker's rule uses the information from the Player's draw."
- q: Without commission, what would the Banker bet's edge be?
  options: ["The house would still have 1.06%", "Zero", "About 1.24% in your favour", "About 5% in your favour"]
  answer: 2
  explain: "Banker at even money would be the exact mirror of Player: +1.24% for you."
- q: After commission, which bet costs less?
  options: ["Player", "Banker", "They're equal"]
  answer: 1
  explain: "Banker 1.06% vs Player 1.24%."
```
