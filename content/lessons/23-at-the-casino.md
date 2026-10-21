---
id: at-the-casino
title: "Playing at a real table"
chapter: real-casino
summary: "Mini, midi and big tables, the squeeze, the commission box and the manners."
minutes: 7
---

**Three kinds of table, same game.**

* **Mini-baccarat**: a blackjack-sized table, up to 7 seats, one dealer who handles every card. Low minimums,
  fast play: about 72 hands an hour. This is where most people play.
* **Midi-baccarat**: up to 9 seats, higher limits. The player with the biggest bet on each side may get to turn
  over the cards.
* **Big table** ("big baccarat"): 12 to 14 seats in a roped-off area, a team of dealers, high limits. Players
  take turns acting as the shoe holder and turn over the cards. Slow and ceremonial: roughly 40 hands an hour.

**The squeeze.** At midi and big tables, the player with the largest bet may **squeeze** the cards:
peel them up slowly from one corner or side, hunting for the spots that reveal the value. It's pure
theatre. The card was decided when the shoe was shuffled. The squeeze adds suspense and slows the game,
which makes it cheaper per hour. The app always reveals cards with a quick flip.

**Commission box.** Many commission tables don't take the 5% from each win. The dealer pays the full
amount and places a marker in a numbered box matching your seat: 50¢ for a $10 Banker win, and so on. You
pay what you owe **before you leave** or when the shoe ends. Bet in amounts that make the commission easy:
$20 wins owe $1 each.

**Etiquette.**

* Buy in by placing cash on the table **between hands**. The dealer can't take cash from your hand.
* Bet before the dealer calls "**no more bets**", and don't touch your chips once the cards are out.
* Don't touch the cards unless the table invites you to (midi and big tables).
* Scorecards and pencils are free. Track the roads if you enjoy it (lesson 16 says what they're worth).
* Tip by placing a small bet for the dealers, or by handing chips over when you leave.
* Superstitions are everywhere: a lucky seat, avoiding the number 4, blowing on cards. Be polite. They cost
  nothing as long as they don't change your bets.

**Old cousins: mention only.** In **Chemin de Fer** ("chemmy") the players take turns being the
Banker, betting against the others, and the house just takes a commission. Some draws are decided by
the players: the Player may choose to draw or stand on 5, and the Banker has options in some spots.
**Baccarat Banque** has a fixed banker playing against two Player hands. Both are rare today, and this
app teaches Punto Banco only.

```scene
id: l23-s1
version: 1
title: Owing commission
bankroll: 50000
allowedBets: [banker]
showEV: true
steps:
  - id: bet
    text: "Bet **$20 on Banker**: a commission-friendly amount."
    allowedActions: [set-bet, clear-bets]
    completeWhen: { betOnFelt: { bet: banker, minAmount: 2000 } }
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [7c, Kh], banker: [4h, Jd, 5c] }
    allowedActions: [deal]
    completeWhen: { hands: 1 }
  - id: owe
    text: "Banker 9 beats Player 7. At a commission-box table the dealer would pay **$20** and put **$1** in your box. The app takes it straight away, so you're paid **$19**. Tap the **commission** line."
    allowedActions: []
    completeWhen: { tapped: commission }
```

```quiz
- q: What does squeezing the cards change?
  options: ["The odds", "The card's value", "Nothing but the suspense (and the pace)", "The commission"]
  answer: 2
  explain: "The card was already fixed. Squeezing only slows things down."
- q: How do you buy in at a baccarat table?
  options: ["Hand cash to the dealer mid-hand", "Put cash on the table between hands", "Give it to another player"]
  answer: 1
  explain: "Lay it on the felt between hands, and the dealer will change it for chips."
- q: At a commission-box table, when do you pay the commission?
  options: ["Before each hand", "When you leave or at the end of the shoe", "Never"]
  answer: 1
  explain: "The dealer tracks it, and you settle up at the end."
- q: Which table is usually fastest?
  options: ["Mini-baccarat", "Midi-baccarat", "Big table"]
  answer: 0
  explain: "One dealer, no squeezing: about 72 hands an hour."
```
