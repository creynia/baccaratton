---
id: final-exam
title: "Final exam"
chapter: real-casino
summary: "Everything, from card values to fun per dollar."
minutes: 10
checkpoint: true
---

Last stop. The scene asks for five calls on random hands, then one bet on a variant table. The quiz covers
the whole course. You can retake it any time: **Retake exam** clears your answers, and your score counts only your first answer to each question.

```scene
id: l24-s1
version: 1
title: Final calls
bankroll: 50000
bets: { banker: 1000 }
seed: 24
showEV: true
onDealsExhausted: random
steps:
  - id: player
    text: "Tap **Deal** and call the Player: **Draw or Stand**? Get two right."
    allowedActions: [deal]
    predict: { kind: player-draws }
    pauseAt: two-cards
    skipNaturals: true
    hint: "0 to 5 draws; 6 and 7 stand."
    completeWhen: { predicted: { correct: true, count: 2 } }
  - id: banker
    text: "Now three right Banker calls. Tap **Deal**."
    allowedActions: [deal]
    predict: { kind: banker-draws }
    pauseAt: player-third
    skipNaturals: true
    hint: "Player stood: 0–5 draws. Player drew: 3 all but 8, 4 on 2–7, 5 on 4–7, 6 on 6–7."
    completeWhen: { predicted: { correct: true, count: 3 } }
```

```scene
id: l24-s2
version: 1
title: Final bet
variant: ez
bankroll: 50000
showEV: true
steps:
  - id: bet
    text: "An EZ table. Place **$10 on the lowest-edge bet** available."
    allowedActions: [set-bet, clear-bets]
    expect: [ { type: set-bet, bet: banker } ]
    hint: "EZ Banker: 1.02%."
    completeWhen: { betOnFelt: { bet: banker, minAmount: 1000 } }
```

```quiz
- q: "What's {{7d 9s}} worth?"
  options: ["16", "6", "7", "9"]
  answer: 1
  explain: "16 → 6."
- q: "Player {{3c Kd}} draws a {{2h}}. Banker has {{Js 4d}}. Does the Banker draw?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "Banker 4 draws on a Player third card of 2 to 7."
- q: "Player {{Th 7c}}. Banker {{5s Kc}}. What does the Banker do?"
  options: ["Draws", "Stands"]
  answer: 0
  explain: "The Player stood on 7, so the Banker uses 0–5 draws."
- q: Which is the lowest-edge bet at a standard 8-deck, 5% commission table?
  options: ["Player", "Banker", "Tie", "Dragon Bonus Player"]
  answer: 1
  explain: "Banker: 1.06%."
- q: $25 Banker, 72 hands an hour, 2 hours. Expected cost?
  options: ["About $3.81", "About $19", "About $38", "About $76"]
  answer: 2
  explain: "72 × 2 × $25 × 1.0579% ≈ $38.08."
- q: After eight Player wins in a row, the next hand is…
  options: ["More likely Banker", "More likely Player", "About as likely as ever to be either"]
  answer: 2
  explain: "Streaks don't change the odds in any useful way."
- q: What does Martingale do to your expected loss?
  options: ["Removes it", "Leaves the edge the same but raises the total bet, so the loss grows", "Halves it"]
  answer: 1
  explain: "Cost = edge × total bet, and Martingale bets more."
- q: Which side bet is the least expensive on the default table?
  options: ["Pair", "Tie", "Dragon Bonus Player", "Dragon Bonus Banker"]
  answer: 2
  explain: "2.65%."
- q: Why can card counting beat the Dragon 7 but not Banker?
  options: ["Dragon 7's EV swings far more with the cards left", "Banker isn't dealt from the shoe", "Counting is banned on Banker"]
  answer: 0
  explain: "8s and 9s have big effects on Dragon 7. On Banker, each card moves the EV by about 0.01%."
```
