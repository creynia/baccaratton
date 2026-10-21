---
id: welcome
title: Welcome to baccarat
chapter: foundations
summary: Two hands, three bets, no decisions after you bet.
minutes: 4
---

Baccarat (say "bah-kah-RAH") is one of the simplest games in the casino, and one of the cheapest to play.
The version almost every casino deals is called **[[Punto Banco]]**, and that's what this app teaches.

The dealer deals two hands. One is called **Player** and the other **Banker**. Those are just names.
You aren't the Player, and the casino isn't the Banker. Before the cards come out, you bet on the hand
you think will win:

- **Player** pays 1 to 1: bet $10, win $10.
- **Banker** pays 1 to 1, minus a 5% commission: bet $10, win $9.50.
- **Tie** (both hands end equal) pays 8 to 1: bet $10, win $80.

Then the dealer deals and the hand plays itself. Each hand gets two cards, sometimes a third, and the
hand **closer to 9** wins. Whether a hand takes a third card is decided by a fixed rule, never by
you or the dealer. You'll learn that rule in chapter 2, but you never have to apply it at a real table.
It's still worth knowing, because it explains everything else: why Banker wins more often, why it pays a
commission, and why so many side bets exist.

So where's the strategy? It's in **which bet you make, at which table, and how much**. The bets have very
different prices. This course shows the exact price of each one before you bet, so you can choose with
your eyes open.

:::tip
Players and Banker aren't seats. At a real table, anybody can bet on either hand, and many people switch back and forth.
:::

```scene
id: l01-s1
version: 1
title: Find the bets
bankroll: 50000
allowedActions: []
showEV: false
steps:
  - id: player
    text: "Tap the **Player** spot."
    completeWhen: { tapped: player }
  - id: banker
    text: "Now **Banker**."
    completeWhen: { tapped: banker }
  - id: tie
    text: "And **Tie**: the bet that both hands end on the same total."
    completeWhen: { tapped: tie }
```

```scene
id: l01-s2
version: 1
title: Your first hand
bankroll: 50000
allowedBets: [player]
showEV: false
steps:
  - id: bet
    text: "Put **$10 on Player**: pick the $5 chip and tap the Player spot twice."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { betOnFelt: { bet: player, minAmount: 1000 } }
  - id: deal
    text: "Tap **Deal** and watch."
    deals:
      - { player: [Kh, 7d], banker: [5s, Qc, Ah] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: result
    text: "Player has 7 (the king counts 0). Banker had 5, drew an ace and made 6. Seven beats six: **Player wins**, and your $10 bet won $10. Notice that you made no decisions after betting."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: In baccarat, what are "Player" and "Banker"?
  options: ["You and the casino", "The two hands you can bet on", "Two seats at the table", "Two dealers"]
  answer: 1
  explain: "They're just the names of the two hands. Anyone can bet on either."
- q: You bet $20 on Banker and it wins. What do you get paid?
  options: ["$20", "$19", "$18", "$160"]
  answer: 1
  explain: "Banker pays 1 to 1 less 5% commission: $20 − $1 = $19."
- q: When do you decide whether a hand takes a third card?
  options: ["After seeing the first two cards", "Before the deal", "Never: a fixed rule decides", "Only when you bet Player"]
  answer: 2
  explain: "The third-card rule is automatic. Your only choices are your bets."
```
