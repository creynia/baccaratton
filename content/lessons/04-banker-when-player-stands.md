---
id: banker-when-player-stands
title: "The Banker's turn, part 1: when the Player stood"
chapter: third-card-rule
summary: If the Player stood, the Banker copies the Player's rule.
minutes: 4
---

Good news: half of the Banker's rule is something you already know.

**If the Player stood** (on 6 or 7, two cards), the Banker uses the **same rule as the Player**:

| Banker's two-card total (Player stood) | Banker |
|---|---|
| 0–5 | **Draws** |
| 6, 7 | **Stands** |

So when the Player stands on 7 and the Banker has 4, the Banker draws, trying to beat that 7. When both
stand on 6, the hand is a **tie**, and Tie bets win.

**If the Player drew** a third card, the Banker's choice depends on its own total **and on the card the
Player just drew**. That's the famous Banker table, and it's the next lesson.

One way to remember the order: **naturals first, then the Player, then the Banker**. The Banker always
acts last, and that's its advantage. It's the only hand that gets to see what the other one did.

```scene
id: l04-s1
version: 1
title: The Banker copies the Player's rule
bankroll: 50000
bets: { banker: 1000 }
showEV: false
steps:
  - id: banker-draws
    text: "Tap **Deal**. The Player will stand on 7. Look at the Banker's two cards: does the **Banker** draw?"
    deals:
      - { player: [7c, Kh], banker: [4h, Jd, 5c] }
    pauseAt: two-cards
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "The Player stood, so the Banker uses the Player's rule: draw on 0 to 5."
    completeWhen: { predicted: { count: 1 } }
  - id: result-1
    text: "Banker had {{4h Jd =4}}, and the Player stood, so the Banker **draws**. The {{5c}} makes 9. **Banker wins 9 to 7**. Your Banker bet won $10 less 50¢ commission: **+$9.50**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: tie
    text: "Tap **Deal** again. The Player stands on 6. Does the **Banker** draw?"
    deals:
      - { player: [3s, 3h], banker: [6d, Ks] }
    pauseAt: two-cards
    predict: { kind: banker-draws }
    allowedActions: [deal]
    hint: "On 6 or 7, the Banker stands when the Player stood."
    completeWhen: { predicted: { count: 1 } }
  - id: result-2
    text: "Banker had {{6d Ks =6}}, so it **stands**. Both on 6: a **tie**. Your Banker bet **pushes**: it comes back to you, with no win and no loss."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player stands on 7. Banker has 5. What does the Banker do?"
  options: ["Draws", "Stands", "Nothing, the Player won"]
  answer: 0
  explain: "When the Player stood, the Banker draws on 0 to 5."
- q: "Player stands on 6. Banker has 7. What happens?"
  options: ["Banker draws", "Banker stands and wins 7 to 6", "Tie"]
  answer: 1
  explain: "The Banker stands on 7, and 7 beats 6."
- q: Who acts last in every hand?
  options: ["The Player", "The Banker", "Whoever has the lower total", "The player with the biggest bet"]
  answer: 1
  explain: "The Banker always acts after the Player. That's where its small advantage comes from."
```
