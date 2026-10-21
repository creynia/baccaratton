---
id: banker-third-card-table
title: "The Banker's turn, part 2: the table"
chapter: third-card-rule
summary: When the Player drew, the Banker reads the Player's third card.
minutes: 8
---

This is the last piece. When the **Player drew** a third card, the Banker looks at its own two-card total
and at the **Player's third card** (not the Player's total):

| Banker has | Banker draws if the Player's third card is | Banker stands if it is |
|---|---|---|
| 0, 1, 2 | **anything** | — |
| 3 | anything **except 8** | 8 |
| 4 | **2 to 7** | 0, 1, 8, 9 |
| 5 | **4 to 7** | 0–3, 8, 9 |
| 6 | **6 or 7** | 0–5, 8, 9 |
| 7 | — | **always stands** |

A ten or a picture card drawn by the Player counts as **0**.

That looks like a lot, but there's a pattern. Read down the "draws if" column from Banker 4 to 6:
**2–7, 4–7, 6–7**. The top end is always **7**, and the bottom end climbs by two each row. Banker 3 is
the generous row: it draws on everything except an 8. Rows 0–2 always draw, and 7 always stands.

**Why does the Banker draw more against a 2–7?** A Player third card of 2–7 usually means the Player
improved to a middle total, so a Banker sitting on 3–6 needs help. A Player's 8, 9, 0 or 1 is a sign
the Player may have stayed low or gone backwards, so the Banker can afford to stand. The table was tuned
long ago so the Banker makes roughly the best play in each spot. That one advantage, acting last with
more information, is why the Banker wins more often (lesson 9).

```tableau
view: banker
```

:::math How the table plays out
Because the Banker sometimes stands on 3–6 and sometimes draws, it draws a little less often than the
Player: 43.5% of all hands, against the Player's 50.3%. A ten-value card is the most common third card
(16 of every 52 cards), and it counts as 0. That's why Banker 4 and 5 **stand** on a Player's 0: the
Player probably didn't improve.
:::

```scene
id: l05-s1
version: 1
title: One row at a time
bankroll: 50000
bets: { banker: 1000 }
showEV: false
steps:
  - id: b3-p8
    text: "Tap **Deal**. The deal pauses after the Player's third card. Banker has **3** here: does the Banker draw?"
    deals:
      - { player: [Ah, 2c, 8s], banker: [Jc, 3d] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 3 draws on anything **except an 8**."
    completeWhen: { predicted: { count: 1 } }
  - id: b3-result
    text: "The Player drew an **8**, so Banker 3 **stands**: 3 against an 8 is the one stand in that row. The Banker's 3 beats the Player's 1."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b4-p2
    text: "Tap **Deal**. This time the Banker has **4**. Watch the Player's third card, then call it."
    deals:
      - { player: [Kd, 4c, 2h], banker: [Qs, 4s, 3h] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 4 draws when the Player's third card is **2 to 7**."
    completeWhen: { predicted: { count: 1 } }
  - id: b4-result
    text: "The Player drew a **2**, so Banker 4 **draws**. The {{3h}} makes 7, and **Banker wins 7 to 6**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b5-p3
    text: "Tap **Deal**. Banker **5** this time. Call it after the Player's third card."
    deals:
      - { player: [5h, Tc, 3d], banker: [2d, 3s] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 5 draws only on a Player third card of **4 to 7**."
    completeWhen: { predicted: { count: 1 } }
  - id: b5-result
    text: "The Player drew a **3**, outside 4–7, so Banker 5 **stands**. Player's 8 wins. (Yes, the rule can leave the Banker standing on a loser. It's a fixed rule, not a choice.)"
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b6-p7
    text: "Tap **Deal**. Banker **6**. Call it after the Player's third card."
    deals:
      - { player: [Ks, Jh, 7c], banker: [4d, 2c, 2s] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 6 draws only on a Player third card of **6 or 7**."
    completeWhen: { predicted: { count: 1 } }
  - id: b6-result
    text: "The Player drew a **7**, so Banker 6 **draws**. The {{2s}} makes 8, and **Banker wins 8 to 7**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: b6-p5
    text: "Last one. Tap **Deal**. Banker **6** again. Call it."
    deals:
      - { player: [Qd, 2s, 5s], banker: [3h, 3c] }
    pauseAt: player-third
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "Banker 6 draws only on a 6 or a 7."
    completeWhen: { predicted: { count: 1 } }
  - id: b6-p5-result
    text: "The Player drew a **5**, so Banker 6 **stands**. **Player wins 7 to 6.** You now know the whole rule."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "The Player drew a 9. The Banker has 3. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 3 draws on everything except an 8."
- q: "The Player drew a 1. The Banker has 4. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "Banker 4 draws only on 2 to 7."
- q: "The Player drew a 6. The Banker has 6. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 6 draws on a Player third card of 6 or 7."
- q: "The Player drew a queen. The Banker has 5. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "A queen counts 0. Banker 5 draws only on 4 to 7."
```
