---
id: sample-welcome
title: Welcome (sample)
chapter: sample-chapter
summary: Placeholder lesson showing every content feature.
minutes: 3
---

The Player holds {{4h 2c =}} and the Banker holds {{Kd 5s =5}}. Both are [[Natural|naturals]] only on 8 or 9.

:::tip
Tips render in a callout, with cards too: {{Qh Qc}}.
:::

:::math Counting the totals
Totals are the sum of the card values, last digit only: 7 + 8 = 15, so the total is 5.
:::

```tableau
view: banker
highlight: [b5/p9, b6/s]
```

```roads
results: BBPBTPPpPb
view: [bead, big]
caption: Placeholder scoreboard.
```

```scene
id: sample-scene
version: 1
title: Look at the table
steps:
  - id: look
    text: "Placeholder step with cards {{Kh 7d}}."
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Does the Banker draw?
  hand: { player: [4h, Ac, 9d], banker: [Kd, 5s] }
  options: [Draw, Stand]
  answer: 1
  explain: "Banker 5 draws only when the Player's third card is 4 to 7."
- q: Which hand is higher?
  options: ["{{9s 9d =}}", "{{As 2d =}}"]
  answer: 0
  explain: "{{9s 9d}} totals 8 and {{As 2d}} totals 3."
```
