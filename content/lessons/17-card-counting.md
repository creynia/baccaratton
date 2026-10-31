---
id: card-counting
title: "Can you count cards at baccarat?"
chapter: perfect-practical
summary: "In theory yes; in practice the main bets barely move. Dragon 7 is the famous exception."
minutes: 9
sources:
  - thorp-walden-1966
  - woo-baccarat-appendix-2
  - jacobson-dragon-bet
---

In blackjack, counting works because the cards left in the shoe can swing the edge to the player. Baccarat
is dealt from a shoe too, so does the same trick work?

**For the main bets, effectively no.**[^1] Every card dealt shifts the odds a little, but the Banker and Player
hands use the same cards and the shifts cancel almost perfectly. Removing one card from a fresh shoe
moves the Banker EV by at most 0.012%.[^2] A huge imbalance is needed to overcome a 1.06% edge.

| One card removed (8 decks) | Banker EV changes by | Player EV changes by |
|---|---|---|
| 4 | **+0.0116%** | −0.0120% |
| 3 | +0.0065% | −0.0067% |
| 6 | **−0.0113%** | +0.0113% |
| 5 | −0.0083% | +0.0084% |

In our simulation of a real shoe (burn, cut card 16 from the end, one more hand after it), with **perfect
knowledge** of every card left, the Banker bet was in your favour in about **1 hand in 500**, and then only by
about **0.4%**. Betting $100 only on those hands would earn about **5 cents an hour** (≈ simulated). Even with
52 cards left, no 4s and eight 6s, the Banker is still at −0.46%.

**The exception: Dragon 7.** The EZ side bet that pays 40 to 1 on a Banker three-card 7 is far more
sensitive. **8s and 9s** left in the shoe hurt it (they make naturals and spoil three-card 7s), and **4s to 7s**
help it. The best-known count (Eliot Jacobson's, from "Card Counting the Dragon Bet")[^3] is:

| Card seen | 4, 5, 6, 7 | 8, 9 | Others |
|---|---|---|---|
| Count | −1 | **+2** | 0 |

Divide the running count by the decks left. When it's **+4 or more**, the Dragon 7 has an edge for the
player. In our simulation that happened on about **9% of hands**, worth about **+8%** per bet on those
hands: roughly **$13 an hour** for a $25 Dragon 7 bettor (≈ simulated).

That's real, but casinos know it. They cap Dragon 7 bets, watch players who bet it only late in the shoe,
and can shuffle at will. Counting the Dragon 7 is legal, but it isn't welcome.

**The Shoe tracker.** Turn it on in Settings, or here in the scene. It shows the **exact** EV of every bet
for the cards left in this shoe, updated after each hand. The normal EV sheet always shows the fresh-shoe
price. Watch the tracker for a few shoes and you'll see the main bets hardly move, while Dragon 7 and
Panda 8 swing.

:::math How the tracker computes EV
The tracker runs the same exact enumeration as the reference tables, over the **unseen** cards: everything
not yet shown. The face-down burn cards are still unseen, so they count as in the shoe. Each result is
exact for that composition.
Effects of removal (fresh 8 decks, % per card, Dragon 7): 0s +0.086, A +0.050, 2 −0.090, 3 −0.108, 4 −0.268,
5 −0.263, 6 −0.324, 7 −0.358, 8 **+0.538**, 9 **+0.479**. The count's signs follow these, as in Jacobson's table.[^3]
Simulation (≈): 3,000 shoes, 243,382 hands, exact EV before every hand. Banker +EV in about 0.19% of hands (average
about +0.4% when positive). Dragon 7 +EV in about 11.5% of hands, Panda 8 in about 5%. With the count at a true +4 or
more: about 9.2% of hands, average about +7.6% to +7.8% per bet (two independent runs).
:::

```scene
id: l17-s1
version: 1
title: The tracker on a fresh shoe
bankroll: 100000
showEV: true
bets: { banker: 1000 }
ui: { shoeTracker: true, speed: fast }
steps:
  - id: open
    text: "The **Shoe tracker** is on. Tap it to open it: on a fresh shoe it matches the EV sheet."
    allowedActions: []
    completeWhen: { tapped: shoe-tracker }
  - id: run
    text: "Deal **20 hands** (tap **Rebet & Deal**) and watch the Banker and Player rows on the tracker."
    allowedActions: [deal, rebet]
    allowedBets: [banker]
    completeWhen: { hands: 20 }
  - id: read
    text: "They barely moved: a few hundredths of a percent either way. That's why counting the main bets doesn't pay."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l17-s2
version: 1
title: A Dragon 7 shoe
variant: ez
bankroll: 100000
showEV: true
ui: { shoeTracker: true }
shoe: { removed: { "0": 111, "1": 28, "2": 27, "3": 27, "4": 27, "5": 27, "6": 27, "7": 27, "8": 32, "9": 31 } }   # leaves 52: 17 tens, 4 aces, five each of 2–7, no 8s, one 9
steps:
  - id: look
    text: "Late in an EZ shoe: **52 cards left**, with no 8s and a single 9. Open the tracker."
    allowedActions: []
    completeWhen: { tapped: shoe-tracker }
  - id: d7
    text: "Dragon 7 is now worth about **+32%** for the cards left, against −7.61% on a fresh shoe. Open the EV sheet on **Dragon 7**: the sheet still shows the fresh-shoe −7.61%, and the tracker shows this shoe."
    allowedActions: [set-bet, clear-bets]
    allowedBets: [dragon-7]
    completeWhen: { previewed: { bet: dragon-7 } }
  - id: end
    text: "Shoes this extreme are rare, and casinos cap the bet. Still, this is the one place in baccarat where counting has teeth."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Why doesn't card counting work for Banker and Player?
  options: ["Counting is illegal", "Each card moves their EV by only about 0.01%, so the edge almost never flips", "The shoe is reshuffled every hand", "The dealer hides the cards"]
  answer: 1
  explain: "The effects are tiny and largely cancel. Positive spots are rare and small."
- q: Which cards remaining in the shoe are bad for the Dragon 7?
  options: ["4s to 7s", "8s and 9s", "Tens and faces", "Aces"]
  answer: 1
  explain: "8s and 9s make naturals and break three-card 7s. When they've been used up, Dragon 7 improves."
- q: What does the EV sheet show, compared with the Shoe tracker?
  options: ["Both show this shoe", "The sheet shows the fresh-shoe price; the tracker shows the cards left", "The tracker is an estimate"]
  answer: 1
  explain: "Both are exact. The sheet is for a full shoe, and the tracker for the cards still unseen."
```
