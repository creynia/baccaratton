---
id: expected-value
title: EV and the house edge, in plain English
chapter: ev-basics
summary: What a bet is worth on average, and how the EV sheet shows it.
minutes: 7
---

No single hand of baccarat is predictable, but a thousand hands are. **[[Expected value]]** is what a bet
returns **on average** if you could repeat the same bet forever. You get it by weighing each result by how
often it happens.

Take $10 on **Player**. In an 8-deck shoe, the Player wins 44.62% of hands, the Banker wins 45.86%, and
9.52% are ties:

- win $10 × 44.62% = +$4.46
- lose $10 × 45.86% = −$4.59
- push $0 × 9.52% = $0

Total: **−$0.12**. On average, a $10 Player bet costs about 12 cents. That −1.24% is the
**[[house edge]]**: the share of each bet the casino keeps on average.

The house edge doesn't mean you lose 12 cents every hand. You win $10 or lose $10 (or push), and
over a few hands you can be well up or well down. What it means is that the average drifts toward
−12 cents a hand, and over thousands of hands the drift is all that's left.

**The [[EV sheet]].** Tap and hold any bet spot, or tap the **EV** button under the table, before you bet. The sheet shows:

- the bet's **EV in dollars** for the chips you're about to place, and its **house edge**;
- its **rating**: Good bet, Fair, Costly or Sucker bet, always written out, never shown by colour alone;
- what it costs **per hour** at 72 hands an hour;
- a better choice, if there is one on this table.

From now on the EV sheet is switched on in every lesson.

:::math The three EVs, exactly (8 decks, per $1)
P(Player wins) = 8712962041376/19524993263685 ≈ 0.446247
P(Banker wins) = 8954111587648/19524993263685 ≈ 0.458597
P(Tie) = 619306544887/6508331087895 ≈ 0.095156

EV(Player) = P(Player) − P(Banker) = −241149546272/19524993263685 ≈ **−1.2351%**
EV(Banker) = 0.95 × P(Banker) − P(Player) = −114753351728/10847218479825 ≈ **−1.0579%**
EV(Tie) = 8 × P(Tie) − (1 − P(Tie)) = −103841353768/723147898655 ≈ **−14.3596%**

They come from every possible order of cards in a full 8-deck shoe (4,998,398,275,503,360 ordered deals of
up to six cards), dealt by the exact tableau.
:::

```scene
id: l08-s1
version: 1
title: Open the EV sheet
bankroll: 50000
allowedBets: [player, banker, tie]
showEV: true
steps:
  - id: player
    text: "Open the EV sheet for a **$10 Player** bet."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { previewed: { bet: player } }
  - id: banker
    text: "About **−$0.12**: 1.24% of the bet. Now open **Banker**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { previewed: { bet: banker } }
  - id: tie
    text: "Banker is a little cheaper: about **−$0.11**, 1.06%. Now **Tie**."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { previewed: { bet: tie } }
  - id: summary
    text: "Tie costs **$1.44** per $10 bet: over 13 times as much as Banker. Same table, same cards, very different prices."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: What does a house edge of 1.06% mean?
  options: ["You lose 1.06% of hands", "On average you lose about 1.06¢ per $1 bet", "The casino wins 1.06% more hands", "You'll lose exactly $1.06 per $100 tonight"]
  answer: 1
  explain: "It's an average cost per dollar bet, not a promise about any one session."
- q: Roughly what is the EV of a $10 Player bet?
  options: ["−$1.24", "−$0.12", "+$0.12", "$0"]
  answer: 1
  explain: "1.24% of $10 is about 12 cents."
- q: Which bet does the EV sheet rate cheapest on a standard table?
  options: ["Player", "Banker", "Tie", "They're all the same"]
  answer: 1
  explain: "Banker: 1.06%. Player: 1.24%. Tie: 14.36%."
```
