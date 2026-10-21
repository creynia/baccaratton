---
id: naturals-and-player-rule
title: Naturals, and when the Player draws
chapter: third-card-rule
summary: "8 or 9: everyone stops. Otherwise the Player draws on 0–5."
minutes: 5
---

The [[third-card rule]] is the one thing in baccarat worth learning by heart. The dealer applies it for you,
but once you know it you can follow every hand, and you'll see why the bets are priced as they are. It
comes in three parts, one per lesson.

**Part 1: naturals.** After two cards each, look at both totals. If **either** hand has 8 or 9, both
hands stand and the higher total wins. A natural 9 beats a natural 8. Two equal naturals are a tie.
About a third of all hands (34.3%) end right here.

**Part 2: the Player's rule.** No natural? The **Player** goes first, and its rule is simple:

| Player's two-card total | Player |
|---|---|
| 0, 1, 2, 3, 4, 5 | **Draws** a third card |
| 6, 7 | **Stands** |
| 8, 9 | Natural: nobody draws |

That's it. The Player never looks at the Banker's cards. On 0–5 the Player draws, and on 6 or 7 it stands.
The Player draws in about half of all hands (50.3%).

Then it's the Banker's turn. The Banker's rule is a little more involved, and it gets the next two lessons.

```tableau
view: player
```

:::math How often each thing happens (8 decks, exact)
Natural on either side: 158222458/461223945 ≈ **34.30%** of hands.
Player draws a third card: 15479099/30748263 ≈ **50.34%**.
Banker draws a third card: 4136876519/9501213267 ≈ **43.54%**.
These are exact fractions over every possible order of cards in an 8-deck shoe.
:::

```scene
id: l03-s1
version: 1
title: A natural stops everything
bankroll: 50000
bets: { player: 1000 }
showEV: false
steps:
  - id: natural
    text: "Tap **Deal**. After two cards each: does the **Player** draw?"
    deals:
      - { player: [4s, 5d], banker: [Qh, 8c] }
    pauseAt: two-cards
    predict: { kind: player-draws }
    allowedActions: [deal]
    hint: "Look for an 8 or a 9 on either side: a natural means nobody draws, so the Player stands."
    completeWhen: { predicted: { count: 1 } }
  - id: result
    text: "Player has a natural 9 ({{4s 5d =9}}) and Banker a natural 8, so **both stand**. 9 beats 8: Player wins."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l03-s2
version: 1
title: Player draws or stands?
bankroll: 50000
bets: { player: 1000 }
showEV: false
steps:
  - id: draws
    text: "Tap **Deal**, add up the Player's two cards, and call it: does the Player **draw** or **stand**?"
    deals:
      - { player: [2h, 3c, 4d], banker: [Td, 7h] }
    pauseAt: two-cards
    predict: { kind: player-draws }
    allowedActions: [deal]
    hint: "The Player draws on 0 to 5."
    completeWhen: { predicted: { count: 1 } }
  - id: draws-result
    text: "Player had {{2h 3c =5}}, so it **draws**. The {{4d}} makes 9. Banker's 7 stands (a Banker 7 always stands), and **Player wins 9 to 7**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
  - id: stands
    text: "New hand. Tap **Deal** and call the Player again."
    deals:
      - { player: [Qs, 6h], banker: [3d, 2s, 3c] }
    pauseAt: two-cards
    predict: { kind: player-draws }
    allowedActions: [deal]
    hint: "On 6 or 7 the Player stands."
    completeWhen: { predicted: { count: 1 } }
  - id: stands-result
    text: "Player had {{Qs 6h =6}}, so it **stands**. The Banker had 5 and drew a {{3c}} to make 8. **Banker wins 8 to 6.** Why did the Banker draw? That's the next lesson."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: "Player has {{Jc 7s =7}} and Banker has {{4d 4h =8}}. What happens?"
  options: ["Player draws", "Banker draws", "Nobody draws: Banker has a natural", "Both draw"]
  answer: 2
  explain: "A natural on either side ends the hand. Banker's 8 beats Player's 7."
  hand: { player: [Jc, 7s], banker: [4d, 4h] }
- q: The Player's two cards total 5. What does the Player do?
  options: ["Draws", "Stands", "It depends on the Banker", "Chooses"]
  answer: 0
  explain: "The Player draws on 0 to 5, whatever the Banker holds (unless the Banker has a natural)."
- q: The Player's two cards total 6. What does the Player do?
  options: ["Draws", "Stands", "It depends on the Banker", "Chooses"]
  answer: 1
  explain: "6 and 7 stand."
- q: About how often does a hand end with a natural?
  options: ["1 in 10", "About 1 in 3", "About half the time", "2 in 3"]
  answer: 1
  explain: "34.3% of hands have a natural on at least one side."
```
