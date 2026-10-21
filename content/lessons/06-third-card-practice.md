---
id: third-card-practice
title: Calling the hand like a dealer
chapter: third-card-rule
summary: Mixed practice, then meet the Drill tab.
minutes: 6
---

Here's the whole rule as a checklist. Dealers run through it in their heads on every hand:

1. **Natural?** If either side has 8 or 9 on two cards, stop. Higher total wins.
2. **Player:** 0–5 draws, 6–7 stands.
3. **Banker, if the Player stood:** 0–5 draws, 6–7 stands.
4. **Banker, if the Player drew:** use the Player's **third card**:
   0–2 always draw · 3 all but 8 · 4 on 2–7 · 5 on 4–7 · 6 on 6–7 · 7 stands.

```tableau
view: full
```

You don't need to be fast. At a real table the dealer does all of this for you, and a dealer who
makes a mistake is corrected by the supervisor. But being able to follow along means no hand ever
looks like magic, and nobody can fool you about what "should" have happened.

The **Drill** tab is a quick-fire trainer for exactly this: it deals a hand, stops, and asks
"Does the Banker draw?" (and other questions), then shows the rule row that decides it. Try a few
rounds of **Banker** mode until it feels easy.

```scene
id: l06-s1
version: 1
title: Five in a row
bankroll: 50000
bets: { banker: 1000 }
seed: 6
showEV: false
onDealsExhausted: random
steps:
  - id: player-calls
    text: "Random hands now. Tap **Deal** and call the **Player**: Draw or Stand? Get three right. (Hands with a natural are skipped.)"
    predict: { kind: player-draws }
    allowedActions: [deal]
    pauseAt: two-cards
    skipNaturals: true
    hint: "Player: 0 to 5 draws, 6 and 7 stand."
    completeWhen: { predicted: { correct: true, count: 3 } }
  - id: banker-calls
    text: "Now the **Banker**. Tap **Deal**; the deal pauses after the Player's turn. Get five right."
    predict: { kind: banker-draws }
    allowedActions: [deal]
    pauseAt: player-third
    skipNaturals: true
    hint: "If the Player stood: 0 to 5 draws. If the Player drew: 3 all but 8, 4 on 2–7, 5 on 4–7, 6 on 6–7."
    completeWhen: { predicted: { correct: true, count: 5 } }
  - id: done
    text: "That's the whole third-card rule. Keep it sharp in **Drill**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player {{9s 7h}}, Banker {{Ac 5d}}. What happens first?"
  hand: { player: [9s, 7h], banker: [Ac, 5d] }
  options: ["Player draws", "Player stands on 6", "Banker draws", "Natural"]
  answer: 1
  explain: "9 + 7 = 16 → 6. Player stands, so the Banker's 6 also stands: a tie."
- q: "Player {{4c Kd}} draws a {{7s}}. Banker has {{5h Qc}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 5 draws on a Player third card of 4 to 7. A 7 is in range."
- q: "Player {{2c 2d}} draws an {{8h}}. Banker has {{Jd 3s}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "Banker 3 stands only on an 8, and this is that case."
- q: "Player {{Ah Ts}} draws a {{4c}}. Banker has {{7c Kc}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 1
  explain: "Banker 7 always stands."
```
