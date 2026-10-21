# baccaratton design decisions

**This file is authoritative.** Where it disagrees with `curriculum.md`, `simulator.md` or
`architecture.md`, this file wins.

## 1. User answers

| # | Topic | Decision |
|---|---|---|
| D1 | Merging | The orchestrator merges PRs (merge commit) after an Opus review and green CI on the latest head. Branches: `main` + `claude/baccaratton-*`. Repo public; Pages source = GitHub Actions. |
| D2 | Default rules | 8 decks, Banker pays 1:1 less 5% commission, Tie 8:1. EZ Baccarat and Super 6 are Settings variants. |
| D3 | Simulated side bets | Player/Banker Pair, Dragon 7 / Panda 8 (EZ only), Dragon Bonus (Player and Banker). Others are explained in lessons only. |
| D4 | Roads | Bead plate + Big Road, with a gambler's-fallacy lesson. Derived roads are explained only. |
| D5 | Hands per hour | 72, for every cost-per-hour figure. |
| D6 | Current-shoe EV | The EV sheet shows full-shoe EV. An optional **Shoe tracker** (off by default; the counting lesson turns it on) shows live exact EV for the cards left in the shoe. |
| D7 | Card reveal | Quick flip only. No squeeze in the app; the squeeze is described in a lesson. |
| D8 | Shoe | Real shoe only: 8 decks, burn by the first card's value, cut card 16 cards from the end, reshuffle after the shoe. No continuous-shuffle option. |
| D10 | Theme | Burgundy felt `#5c1a2b` with gold trim; the same `theme_color`. |
| D11 | Tabs | Learn · Play · Drill · More. Drill = third-card-rule trainer; Bets, Roads, Glossary under More. |
| D12 | First view | A Claude Artifact of the single-file build as soon as the table deals, then Pages. GitHub Actions/Pages is already enabled: **the Pages deploy workflow ships in WP0**, so every merge to `main` deploys from the start. |

## 2. Orchestrator calls

| # | Topic | Decision |
|---|---|---|
| D9 | Betting systems | Every system is an auto-play preset (flat Banker/Player/Tie, Martingale, Paroli, 1-3-2-6, Fibonacci, D'Alembert, Labouchère, follow-the-shoe), compared on the same seed with bankroll charts. |
| D13 | Ids | Bets: `player`, `banker`, `tie`, `player-pair`, `banker-pair`, `dragon-bonus-player`, `dragon-bonus-banker`, `dragon-7`, `panda-8` (the last two in `ez` only). Variants: `punto-banco` (default), `ez`, `super-6`; one `SimSettings.variant` field (architecture's `commission: 'classic'` is replaced). Tie 9:1 is a separate setting (`tiePays`). Strategies: `flat-banker`, `flat-player`, `flat-tie`, `martingale`, `paroli`, `one-three-two-six`, `fibonacci`, `dalembert`, `labouchere`, `follow-the-shoe`, `side-bet-sprinkler`. Chapter and lesson ids: curriculum.md §4 (24 lessons, 7 chapters). |
| D14 | Primary metric | **House edge per bet placed**, ties counted as a push for Player and Banker. Shown as % and as $ per hand and $ per hour (72/h). The per-resolved-bet figure (ties excluded) appears only in "Why?". Element of risk is not used (it equals the house edge for every baccarat bet). |
| D15 | Commission | Taken from the win at settlement. Rule: gross rounds down, commission rounds up (simulator.md §1.5). Bets are whole dollars, so rounding never fires; a registry test asserts this. The curriculum's "round commission down" note is superseded and moot. The commission box is lesson text only (chip). |
| D16 | Table limits | $5 minimum and $5,000 maximum on Player/Banker; Tie and side bets $1–$500; chips $1, $5, $25, $100, $500 (curriculum.md §2.1). |
| D17 | Shoe end | When the cut card comes out, the hand completes, **one more hand** is dealt, then the next Deal reshuffles. Forced cards are swapped into the shoe; a forced card with no copy left triggers a reshuffle first. |
| D18 | EV transport | No Web Worker (architecture Plan A). The EV sheet is synchronous; exact full recompute ≈ 1.4 ms desktop. The Shoe tracker recomputes after every hand. Multi-hand simulation runs through the time-sliced same-thread job client (`src/sim/jobs`), one `simulate` job kind. |
| D19 | Tiers | On edge per bet placed: `free` ≤ 0 < `good` ≤ 2% < `fair` ≤ 5% < `costly` < 9% ≤ `sucker`. Text label always. `sucker` needs a second tap ("Bet it anyway") when `confirmCostlyBets` (default on); `costly` shows the better-alternative card. In `super-6`, the alternative for Banker is Player. |
| D20 | Empty-felt deal | Allowed (a no-money hand) for roads lessons and follow-the-shoe waiting. |
| D21 | Auto-play lengths | 72 / 720 / 7,200 hands (1, 10, 100 hours). |
| D22 | Roads & Drill placement | Roads in `src/sim/engine/roads.ts`; Drill in `src/sim/strategy/drill.ts`. |
| D23 | Scenes | The `SceneConfig` in simulator.md §5.1 is authoritative; the curriculum's scene names map 1:1 (simulator.md §5.3). |
| D24 | File ownership | simulator.md §8 wins inside `src/sim/**`; architecture.md for the rest. Content split: **content-a** lessons 1–8 + `content/*.json`; **content-b** lessons 9–16; **content-c** lessons 17–24. |
| D25 | Pinned numbers | simulator.md §2.5 is the source of the pinned fractions; curriculum.md must match it. |

## 3. Design-review resolutions (Opus review of 5aa9dd6)

An independent exact enumerator (Python `fractions`) reproduced every pinned number in simulator.md
§2.5 and curriculum.md §6 and §11, plus the removal effects, the systems' 72-hand costs, the ruin and
streak tables, and Labouchère (≈ simulated). The five frozen type blocks compile under `--strict`.
The items below fix the scene dialect, contracts and copy. Content and implementation agents follow
these over the spike docs.

### D26 Scene dialect (content writes simulator `SceneConfig` only)
Mapping: `rules:{variant}` → `variant`; `place-bet` → `set-bet`; `predict.hand` → `predict.side`;
`shoe:{remaining}` → `shoe:{removed}` (removed = 8-deck count − remaining); StrategySpec `bet` →
`target`, `side` → `sideBets`. Add `skipNaturals?: boolean` to `SceneStep`: on a natural hand no
PredictBar shows and the hand doesn't count. There is no "Natural, nobody draws" button; l03-s1 asks
"Does the Player draw?" (answer Stand, rule `natural`). Predict buttons read **Draw · Stand**.

### D27 Predict and result steps
Predict steps allow `[deal]` and carry the step's `deals`. A single forced-hand step completes on
`{predicted:{count:1}}`: a wrong answer shows the hint and the rule row, with no replay, so the next
step's text stays true. Random-hand steps keep `{predicted:{correct:true,count:n}}` with
`onDealsExhausted: random`. Result steps use `{acknowledged:true}` with `allowedActions: []`. The
`hands` condition counts only hands dealt since the step started. `read` steps (l09, l10, l15,
l17-s1, l19, l22) set `allowedActions: []`.

### D28 Systems contract
Optional StrategySpec fields `maxSteps` (Martingale 7), `maxUnits` (D'Alembert 20), `maxBetUnits`
(Labouchère 100); Fibonacci resets after a loss on 89. Over a limit the system resets to step 1
(D'Alembert stays at its cap). Bust = the next bet can't be covered. The exact lesson costs must
equal what auto-play reports with these caps.

### D29 Drill contract
`DrillSpot` and `DrillFilter` carry `category: DrillCategoryId` (the 14 ids in curriculum.md §9.1).
`DrillMode` groups them: `player` ⊇ natural, player-draw; `banker` ⊇ banker-*; `winner` = who-wins;
`payout` = settle; hand-total and which-bet appear in `mixed`. Progress is persisted per category;
routes take `?cat=` and `?focus=misses`. There is no `total` mode.

### D30 Copy and number fixes (curriculum spike applies)
- Pair SD **3.1549** (lesson 15: "3.15").
- Player vs Banker at $10 × 72/h = **$1.28** (lessons 11, 14, 18 prose, quizzes, tables); lesson 14
  **$11.43**; §9.3 **$60.59/h**; lesson 22 Dragon Bonus Player big wins per hour **2.0**.
- Shoe study re-run under D8/D17 (one more hand after the cut card), all labelled ≈ simulated:
  Banker positive on ≈0.19% of hands (avg +0.37% when positive); Dragon 7 positive ≈11.5%; Panda 8
  ≈5.3%; count ≥ +4 on ≈9.2% of hands, avg ≈+7.8%. Lesson 17: "about 1 hand in 500, by about
  0.4%… about 5 cents an hour"; "about 9% of hands, about +8% per bet, roughly $13 an hour at $25
  (≈ simulated)". Delete §13.4's "changes nothing material".
- Tier names per D19 everywhere: `costly` / `sucker`, badges "Costly" / "Sucker bet" / "No house
  edge" (tracker "Edge to you"); setting `confirmCostlyBets`. The Sucker confirmation is the inline
  second tap; the sheet does not auto-open.
- l01-s2: "tap the $5 chip twice" (no $10 chip, D16).
- l17-s1: run step `allowedActions:[deal,rebet]`, `completeWhen:{hands:20}`; tracker "rows", not "lines".
- l22-s1: "the expected line", not the band's centre. Lesson 17: "52 cards left, no 4s, eight 6s".
- With `rebet` allowed and `lastBets` non-empty, the empty-felt Deal button is "Rebet & Deal".

### D31 Alternatives
"Use this" always moves the amount to the cheapest **main** bet (in `super-6`, Player). §8.3 may name
a cheaper side bet in text only. The Player → Banker tip is shown.

### D32 Per-resolved edge (amends D14)
The per-resolved-bet figure (ties excluded) appears in "Why?", in More → Bets detail, and in lesson
13/14 prose. Never on the EV sheet's headline.

### D33 Architecture names (architecture spike applies)
`rules`/`commission` settings and `?rules=`/`?commission=` → `variant`, `tiePays`, `?variant=`,
`?tie=`; `simulateMany` → `simulate` with `sessions`; `previewBets` → `previewSlip`; Drill `total`
mode → `winner`; curriculum §10 "in the worker" → same thread. Content split per D24 (replace the
architecture §9 descriptions).

### D34 Markup
Tableau view `full` (not `both`). One cell-id syntax: simulator `TableauCellId` (`b4/p7`, `b6/s`,
`p5`), including `#/rules?highlight=`. Quiz `hand` is YAML arrays. The ` ```roads ` block is parsed by
engine `parseRoadString` (engine/roads.ts).

### D35 UI ownership additions
table-ui owns `SessionPanel.tsx` (curriculum §8.4 fields; used in l14, l18) and a tappable commission
line in the settlement toast (target `commission`, l07-s1, l23-s1).

### D36 Shoe setups
A `ShoeSetup` may leave as few as 6 unseen cards; no deal is allowed when fewer than 40 cards remain
before the cut card. The burn's face-up card comes from the removed set (l17-s2's 52-card shoe).

### D37 WP0 additions
WP0 also creates `src/sim/engine/job.ts` verbatim from holdumb (`protocol.ts` imports it; frozen,
prettier-ignored) and `src/sim/ui/types.ts` with `SimSettings` (D13 fields; app `Settings` extends
it). WP0 implements `TABLEAU`, `betsOffered` and `parseRoadString` for real, with variant ids. Batons
add `src/sim/ui/types.ts`, `src/sim/engine/job.ts`, `.prettierignore` and architecture §6's [B]
dotfiles. Simulator §1.1 `parseCard(s)` → `parseCards`.

### D38 Auto-play run steps (re-review nit)
Auto-play `run` steps (l09, l10, l15, l19, l22) set `allowedActions: []`; auto-play has its own Run
control. Content agents apply this when writing those lessons.

Re-review of e9805a1: every item B1–B4, S1–S15 and the nits is fixed; the numbers that changed were
re-derived (lesson 9 ±$250, lesson 15 8.33% ruined / −$76.17, lesson 22 −$172 / −$593, Labouchère
≈15% vs ≈0.02–0.03% bust, simulated). APPROVED.

## 4. Decisions made during implementation

### D39 Lesson 19 average bets
Fibonacci's average bet is **$24.56** (2.45646 units) and D'Alembert's **$45.73** (4.57348 units) at
a $10 unit. curriculum.md §7.2's 4-decimal unit figures were rounded twice; per-hour costs are
unchanged. Lessons and tests use the exact values.

### D40 Lesson 12 and scene fixes
The 4% commission table costs **$4.32/h** at $10 × 72 (exact $4.31502). The duplicate
`allowedActions` keys in l13-s1 and l24-s1 (invalid YAML) were removed.

### D41 Engine behaviour (amends simulator.md §1.6, §3.1)
- A `ShoeSetup` takes the face-up burn card from the first removed card whose value the remaining
  removed cards can cover (deterministic). A setup leaving fewer than 6 physical cards throws.
- `parseRoadString` also accepts comma-separated and run-together tokens; a bare `n` means a natural 9.
- `createGame({shoe})` shuffles immediately (shoe 1, no shuffle events), so the tracker shows the setup
  before the first deal.

### D42 "Use this" amount (amends D31)
The better-alternative moves `max(slip amount, rules.mainMin)` to the cheapest main bet, and the
per-hour saving is computed for that amount (a $1 Tie becomes a $5 Banker, saving $6.53/h). When the
larger main bet would cost more per hour than the side bet, no alternative is offered.

### D43 Strategy table limits (amends D28)
One shared rule caps every system at the table maximum: a next bet above it resets the system to step 1,
except D'Alembert, which clamps at `floor(mainMax / unit)`. The unit is limited to
`[min, floor(max / first-bet units)]` (Labouchère: $1,000). The exact cost and auto-play use the same rule.
