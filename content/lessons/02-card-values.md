---
id: card-values
title: "Counting a hand: only the last digit"
chapter: foundations
summary: Tens are zero, and you drop the tens digit.
minutes: 4
---

Baccarat totals are tiny. Every hand is worth **0 to 9**.

| Card | Value |
|---|---|
| Ace | 1 |
| 2 to 9 | Face value |
| 10, Jack, Queen, King | **0** |

To total a hand, add the cards and **keep only the last digit**:

- {{7h 2c =9}} = 9.
- {{9c 6d =5}} = 15 → **5**.
- {{Kd Jh =0}} = 0 + 0 = **0**. (Players call this "baccarat", the worst hand.)
- {{8s 8d =6}} = 16 → **6**.

You can never "bust" in baccarat, and a hand never goes above 9. A third card is added the same way:
{{9c 6d =5}} is 5, and a {{3h}} makes it 8.

A two-card total of **8 or 9** is a **[[natural]]**: the best start you can have. When either hand has a
natural, the hand is over at once. Nobody draws. The next lesson starts there.

```scene
id: l02-s1
version: 1
title: What's the total?
bankroll: 50000
bets: { player: 1000 }
showEV: false
steps:
  - id: total
    text: "Tap **Deal**. The deal stops after two cards each: what is the **Player** total?"
    deals:
      - { player: [9c, 6d, 3h], banker: [Kd, Jh, 7s] }
    pauseAt: two-cards
    predict: { kind: hand-total, side: player }
    allowedActions: [deal]
    hint: "9 + 6 = 15. Keep only the last digit."
    completeWhen: { predicted: { count: 1 } }
  - id: finish
    text: "It's **5** (9 + 6 = 15). Banker has 0 (two picture cards). Both hands draw. Player's {{3h}} makes 8 and Banker's {{7s}} makes 7. **Player wins 8 to 7**, and your $10 on Player won."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "What is {{8h 7c}} worth?"
  options: ["15", "5", "7", "1"]
  answer: 1
  explain: "8 + 7 = 15, and you keep the last digit: 5."
- q: "What is {{Qs 9d}} worth?"
  options: ["19", "9", "0", "10"]
  answer: 1
  explain: "The queen is 0, so the hand is 9: a natural."
- q: "A hand is {{6c 4h}} and draws {{Ks}}. What's the total?"
  options: ["0", "10", "20", "4"]
  answer: 0
  explain: "6 + 4 = 10, which is 0. Adding a king (0) keeps it at 0."
- q: Which two-card totals are naturals?
  options: ["9 only", "8 and 9", "7, 8 and 9", "Any pair"]
  answer: 1
  explain: "A natural is 8 or 9 on the first two cards. It ends the hand at once."
```
