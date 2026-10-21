# baccaratton: Simulator Design

Status: design spike, ready for reconciliation. Owner: simulator track.
Related: `architecture.md` (app shell, job client, build, WPs), `curriculum.md`
(lessons that embed scenes, the bet reference table), `decisions.md` (wins over all).
Reference implementation: holdumb `src/sim/**` and its `docs/design/simulator.md`.

The simulator is a phone-first Punto Banco table. There is **one decision: what
to bet**. You build a bet slip (Player, Banker, Tie and the side bets the variant
offers), and **before you tap Deal** every bet spot shows its exact expected value,
a tier badge with a text label, the cost per hand and per hour, a better
alternative and a "Why?" breakdown. The hand then plays itself by the fixed
tableau. The same component runs as the free sandbox (Play tab), inside lessons
as guided **scenes** with forced cards, and as an **auto-play** runner for betting
systems. Drill (a tab) is a third-card-rule trainer built on the engine's own
drawing functions.

**Every number in this document was verified** by two independent exhaustive
enumerators (Python `fractions` and a JS port in bigint) plus a Monte-Carlo
check. Scratch code: `/tmp/baccaratton-scratch/simulator/` (`oracle.py`,
`rows.py`, `bench.mjs`, `shoe.mjs`).

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Money | Integer **cents** in the engine. EV in exact `bigint` fractions `{num, den}`. Bets are whole dollars (`betUnit` 100), so every payout in every preset is an exact number of cents (§1.5). |
| Engine | Pure, immutable, framework-free TS in `src/sim/engine/`. No DOM, no `Math.random`, no `Date`. A whole hand resolves in **one** `applyAction('deal')`; the UI paces the events. |
| Rules | D2: 8 decks, Banker 1:1 less 5% commission, Tie 8:1 (9:1 is a setting). Variants `punto-banco` (default), `ez` (no commission, Banker winning 3-card 7 pushes), `super-6` (no commission, Banker winning 6 pays 1:2). |
| Bets | Registry of 9 bets as data with a `settle()` function (§1.4): `player`, `banker`, `tie`, `player-pair`, `banker-pair`, `dragon-bonus-player`, `dragon-bonus-banker`, plus `dragon-7` and `panda-8` in EZ only (D3). Ids are the curriculum's. |
| Shoe | D8: real shoe only. Shuffle, turn the first card face up and burn that many cards face down (A = 1 … 9 = 9, T/J/Q/K = 10), cut card 16 from the end, finish the hand, deal **one more hand**, then the next Deal reshuffles. No continuous shuffler. |
| RNG | holdumb's `xoshiro128**` seeded through `splitmix32`, `randBelow` by rejection, Fisher-Yates over the 416 cards. RNG state lives in `GameState`, so play is replayable. |
| Forced cards | `ForcedHand { player: [c1, c2, c3?], banker: [c1, c2, c3?] }` (the curriculum's shape), dealt in real order P1 B1 P2 B2, P3, B3. The engine **swaps** the forced cards into the next positions of the shoe, so the composition stays honest. A third card must be present exactly when the tableau draws one. |
| EV | **Exact** enumeration of the tableau over the value composition of the unseen cards: 339,400 weighted leaves for a full 8-deck shoe, folded into a 400-cell outcome histogram; every bet's EV is a dot product of the histogram with the registry's own payouts. Pairs are a closed form over rank counts. |
| Speed | 1.4 ms per full recompute in desktop Node 22 (all 9 bets, exact fractions); 47.7 ms with the JIT disabled (a worst-case stand-in for a slow phone). **No Web Worker** (architecture Plan A confirmed). The Shoe tracker recomputes live after every hand (D6). |
| Primary metric | **House edge per bet placed** (ties count as a push for Player/Banker), in % and $ per hand / per hour at 72 hands/hour (D5). The per-resolved-bet figure (ties excluded) appears in "Why?". |
| Tiers | `free` ≤ 0 < `good` ≤ 2% < `fair` ≤ 5% < `costly` < 9% ≤ `sucker`. Text label always, colour never alone. `sucker` needs a second tap when `confirmCostlyBets` is on. |
| Roads | D4: Bead plate + Big Road, derived from hand results in `engine/roads.ts` (pure). Derived roads (Big Eye Boy, Small Road, Cockroach) are not drawn; their exact rules are documented in §3.4 for the lesson text and a possible chip. |
| Rendering | SVG felt with data-driven layouts for portrait 390×844 and landscape 844×390. Third cards lie sideways. Every target ≥ 44 px. Quick flip only, **no squeeze** (D7). |
| Strategies | D9: every betting system is an auto-play preset, compared on the same seed (same cards), with p10–p90 bands and a survival curve. |
| Drill | Third-card-rule trainer: modes `player`, `banker`, `winner`, `payout`, `mixed`; spots, grading and spot codes are pure functions in `strategy/drill.ts`. |

---

## 1. Game engine (`src/sim/engine/`)

### 1.1 Files

```
src/sim/engine/
  types.ts        // FROZEN contract, verbatim from §1.2
  cards.ts        // parseCard(s), cardCode, rankOf, suitOf, cardValue, cardName (a11y), FULL_DECK
  rng.ts          // seedRng, nextU32, randBelow, shuffle (verbatim from holdumb)
  shoe.ts         // newShoe(rng, rules), burn, draw, placeForced, applySetup, unseenRanks
  tableau.ts      // handTotal, isNatural, playerDraws, bankerDraws, TABLEAU (literal table), playHand
  bets.ts         // BETS registry (BetDef per BetId), DRAGON_BONUS_TABLE, betsOffered(rules)
  rules.ts        // VARIANT_RULES, DEFAULT_RULES, resolveRules
  settle.ts       // settleHand(hand, bets, rules) -> HandResult (pure), profitCents
  validate.ts     // validateAction, validateForcedHand
  roads.ts        // roadEntry(hand), beadPlate, bigRoad, roadCounts (+ derived-road helpers, §3.4)
  game.ts         // createGame, applyAction, replay, visibleView, equity, legalActions
  job.ts          // Progress, Job (verbatim from holdumb)
  money.ts        // formatMoney, formatPct (verbatim from holdumb)
  log.ts          // LogEntry helpers
  index.ts
  __tests__/oracle.ts        // independent tableau + settlement oracle (does NOT import tableau/bets/settle)
```

### 1.2 `types.ts` (frozen contract: WP0 copies it verbatim)

```ts
// ===== src/sim/engine/types.ts — FROZEN. Changes go through main. =====
export type Cents = number; // integer cents; $10 = 1000

// ---------- cards ----------
/** 0..51 = rank * 4 + suit. */
export type Card = number;
/** 0 = ace, 1 = two … 8 = nine, 9 = ten, 10 = jack, 11 = queen, 12 = king. */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/** 0 = spades, 1 = hearts, 2 = diamonds, 3 = clubs (the order of 'shdc'). */
export type Suit = 0 | 1 | 2 | 3;
/** 'Ah', 'Td', '7c' — rank char from 'A23456789TJQK', suit char from 'shdc'. */
export type CardCode = string;
export const RANK_CHARS = 'A23456789TJQK';
export const SUIT_CHARS = 'shdc';
/** Baccarat value: A = 1, 2–9 face value, T/J/Q/K = 0. Hand total = sum mod 10. */
export type CardValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Side = 'player' | 'banker';
export type Winner = 'player' | 'banker' | 'tie';

// ---------- rules ----------
export type VariantId = 'punto-banco' | 'ez' | 'super-6';
export const VARIANT_IDS: readonly VariantId[] = ['punto-banco', 'ez', 'super-6'];
export type TiePays = 8 | 9;
/** Payout "num to den" (19:20 = [19, 20]). */
export type Odds = readonly [number, number];

export interface TableRules {
  variant: VariantId;              // 'punto-banco'
  decks: number;                   // 8 (the engine accepts 1..8; the UI offers 8 only)
  tiePays: TiePays;                // 8
  /** Banker commission in punto-banco ([1, 20] = 5%). Ignored by ez and super-6. */
  commission: Odds;
  cutCardFromEnd: number;          // 16 (D8)
  afterCutCard: 'one-more-hand';   // D8: finish the hand, deal one more, then reshuffle
  burn: 'first-card-value';        // face-up card, then that many face down (T/J/Q/K = 10)
  betUnit: Cents;                  // 100: every bet is whole dollars
  mainMin: Cents; mainMax: Cents;  // player, banker: 500 .. 100_000
  sideMin: Cents; sideMax: Cents;  // tie and side bets: 100 .. 10_000
}

// ---------- bets ----------
export type BetId =
  | 'player' | 'banker' | 'tie'
  | 'player-pair' | 'banker-pair'
  | 'dragon-bonus-player' | 'dragon-bonus-banker'
  | 'dragon-7' | 'panda-8';         // ez only (D3)
/** Display order (felt, EV sheet, settlement). */
export const BET_IDS: readonly BetId[] = [
  'player', 'tie', 'banker', 'player-pair', 'banker-pair',
  'dragon-bonus-player', 'dragon-bonus-banker', 'panda-8', 'dragon-7',
];
export type Slip = Readonly<Partial<Record<BetId, Cents>>>;

/** Everything a bet may depend on. `basis` says which fields a bet reads (tested, §7.1). */
export interface TableauOutcome {
  playerTotal: CardValue;
  bankerTotal: CardValue;
  playerCards: 2 | 3;
  bankerCards: 2 | 3;
  /** First two Player cards have the same rank (K-K yes, K-Q no). */
  playerPair: boolean;
  bankerPair: boolean;
}

export type SettleReason =
  | 'side-wins' | 'side-loses' | 'tie-push'            // player / banker
  | 'banker-commission'                                // punto-banco banker win (5% taken)
  | 'ez-banker-three-card-7-push'                      // ez: banker wins with a 3-card 7 → push
  | 'super-6-half'                                     // super-6: banker wins with 6 → pays 1:2
  | 'tie-pays' | 'tie-loses'
  | 'pair' | 'no-pair'
  | 'natural-win' | 'natural-tie-push' | 'win-by-margin' | 'margin-under-4' | 'dragon-bonus-loses'
  | 'dragon-7' | 'no-dragon-7' | 'panda-8' | 'no-panda-8';

export interface Payout {
  result: 'win' | 'push' | 'lose';
  /** Gross win odds before commission (win only), e.g. [1, 1], [8, 1], [1, 2]. */
  gross: Odds;
  /** Commission on the amount (punto-banco banker win only): profit = gross − commission. */
  commission: Odds | null;
  reason: SettleReason;
}

export interface BetDef {
  id: BetId;
  label: string;                    // 'Banker'
  short: string;                    // 'B' (felt label at small sizes)
  kind: 'main' | 'side';            // main = player / banker / tie (top row)
  limits: 'main' | 'side';          // which min/max apply (tie uses side limits)
  /** Which outcome fields settle() may read. */
  basis: 'tableau' | 'player-pair' | 'banker-pair';
  offeredIn: readonly VariantId[];
  payoutText(rules: TableRules): string; // 'Pays 1 to 1, less 5% commission'
  settle(o: TableauOutcome, rules: TableRules): Payout;
}

// ---------- tableau ----------
export type TableauRuleId =
  | 'natural'                          // someone has 8 or 9 in two cards: both stand
  | 'player-0-5-draws' | 'player-6-7-stands'
  | 'banker-player-stood-0-5-draws' | 'banker-player-stood-6-7-stands'
  | 'banker-0-2-draws'
  | 'banker-3-draws-unless-8'
  | 'banker-4-draws-on-2-7'
  | 'banker-5-draws-on-4-7'
  | 'banker-6-draws-on-6-7'
  | 'banker-7-stands';
export interface DrawDecision { draws: boolean; rule: TableauRuleId }
export interface HandCards {
  cards: readonly Card[];            // 2 or 3, in deal order
  total: CardValue;
  natural: boolean;                  // two cards totalling 8 or 9
}
export interface HandRecord {
  n: number;                         // 1-based hand number in the session
  shoeNo: number;
  handInShoe: number;                // 1-based
  player: HandCards;
  banker: HandCards;
  playerRule: DrawDecision;
  bankerRule: DrawDecision;
  winner: Winner;
  natural: boolean;                  // either side had a natural
  outcome: TableauOutcome;
  forced: boolean;
}

// ---------- shoe ----------
/** Lesson cards for one hand, real deal order P1 B1 P2 B2, then P3, then B3. */
export interface ForcedHand {
  player: readonly CardCode[];       // 2 or 3 cards
  banker: readonly CardCode[];       // 2 or 3 cards
}
/** Rich or poor shoes for lessons: cards removed as if already dealt (they count as seen). */
export interface ShoeSetup {
  seed?: number;
  /** Value class → how many cards to remove ('0' = tens and faces). Ranks within a class round-robin, suits round-robin. */
  removed?: Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9', number>>;
  /** Deal the shoe forward to this card index (after the burn) without playing hands; those cards count as seen. */
  startAtCard?: number;
}
export interface ShoeState {
  shoeNo: number;                    // 0 = not shuffled yet (the first deal shuffles)
  order: readonly Card[];            // hidden: the full shoe order (decks × 52)
  pos: number;                       // next card to draw
  cutIndex: number;                  // order.length − cutCardFromEnd
  burn: { faceUp: Card; count: number } | null;
  cutCardOut: boolean;               // the cut card has come out
  extraHandDealt: boolean;           // the one-more hand after the cut card is done
  finished: boolean;                 // the next deal reshuffles
  /** Copies of each card id (0..51) seen face up this shoe: dealt cards, the burn's face-up card, ShoeSetup removals. */
  exposed: readonly number[];
  handsThisShoe: number;
}

// ---------- roads ----------
export interface RoadEntry {
  winner: Winner;
  playerPair: boolean;
  bankerPair: boolean;
  natural: boolean;
  /** Winning total (for a tie, the tied total). */
  total: CardValue;
  /** True for history prefilled by a scene (not dealt from this shoe). */
  prefilled?: boolean;
}
export interface BeadCell { col: number; row: number; index: number; entry: RoadEntry }
export interface BigRoadCell {
  col: number; row: number;          // physical grid position (row 0 = top)
  streak: number;                    // 0-based logical column (streak index)
  winner: 'player' | 'banker';
  ties: number;                      // ties recorded after this result (green slash, number if > 1)
  playerPair: boolean; bankerPair: boolean; natural: boolean;
  index: number;                     // index into the RoadEntry list
}
export interface BigRoad {
  cells: readonly BigRoadCell[];
  /** Ties before the first Player/Banker result of the shoe (drawn on the first cell). */
  leadingTies: number;
  /** Streak lengths, for the derived-road lesson and helpers. */
  streaks: readonly { winner: 'player' | 'banker'; length: number }[];
}

// ---------- state ----------
export interface BetSettlement {
  bet: BetId;
  amount: Cents;
  result: 'win' | 'push' | 'lose';
  /** > 0 win (after commission), < 0 loss, 0 push. */
  profit: Cents;
  /** Commission taken from a punto-banco Banker win (0 otherwise). */
  commission: Cents;
  reason: SettleReason;
}
export interface HandResult {
  hand: HandRecord;
  settlements: readonly BetSettlement[];   // in BET_IDS order, placed bets only
  wagered: Cents;
  net: Cents;                              // Σ profit
}
export interface SessionStats {
  hands: number;
  winners: Record<Winner, number>;
  naturals: number;
  wagered: Record<BetId, Cents>;
  net: Record<BetId, Cents>;
  commissionPaid: Cents;
}
export interface RngState { s: readonly [number, number, number, number] }

export interface GameState {
  version: 1;
  rules: TableRules;
  /** Chips in the rack, NOT on the felt. */
  bankroll: Cents;
  /** Chips on the felt for the next hand. Empty after a hand settles (winners return to the rack). */
  bets: Slip;
  /** The slip of the last dealt hand (for Rebet). */
  lastBets: Slip;
  shoe: ShoeState;
  /** This shoe's results (roads). Reset when the shoe is reshuffled. */
  history: readonly RoadEntry[];
  lastResult: HandResult | null;
  handCount: number;
  rng: RngState;
  seed: number;
  forced: readonly ForcedHand[];     // FIFO, consumed by 'deal' before the shoe order
  stats: SessionStats;
}

// ---------- actions ----------
export type Action =
  | { type: 'set-bet'; bet: BetId; amount: Cents }   // 0 removes the bet
  | { type: 'clear-bets' }                           // all chips back to the rack
  | { type: 'rebet' }                                // put lastBets back on the felt
  | { type: 'deal'; rebet?: boolean }                // rebet first when the felt is empty; an empty felt deals a hand with no money ("sit out")
  | { type: 'new-shoe' };                            // end the shoe now; the next deal reshuffles
export type ActionType = Action['type'];

export type ValidationCode =
  | 'bad-amount' | 'below-min' | 'above-max' | 'insufficient-funds'
  | 'not-offered'                    // the bet is not offered by this variant
  | 'no-last-bets'
  | 'bad-forced-hand'                // codes, card count, or third card vs tableau
  | 'not-allowed-by-scene';          // scene layer only, never the engine
export type Validation =
  | { ok: true }
  | { ok: false; code: ValidationCode; message: string };

// ---------- events (one 'deal' emits them in this order) ----------
export type PausePoint = 'two-cards' | 'player-third' | 'all-cards';
export type GameEvent =
  | { type: 'bet-set'; bet: BetId; from: Cents; to: Cents }
  | { type: 'bets-cleared' }
  | { type: 'shoe-shuffled'; shoeNo: number; decks: number }
  | { type: 'burn'; faceUp: Card; count: number }
  | { type: 'hand-started'; n: number; shoeNo: number; handInShoe: number; forced: boolean }
  | { type: 'cut-card' }                                           // just before the card-dealt that reaches cutIndex
  | { type: 'card-dealt'; to: Side; index: 0 | 1 | 2; card: Card; sideways: boolean } // index 2 = third card, sideways
  | { type: 'pause-point'; at: PausePoint }                        // markers for staged reveals (scenes, drill)
  | { type: 'natural'; side: Side | 'both'; player: CardValue; banker: CardValue }
  | { type: 'draw-decision'; side: Side; total: CardValue; decision: DrawDecision }
  | { type: 'hand-result'; hand: HandRecord }
  | { type: 'road-updated'; entry: RoadEntry }
  | { type: 'bet-settled'; settlement: BetSettlement }
  | { type: 'hand-settled'; result: HandResult }
  | { type: 'shoe-finished' }                                      // after the extra hand
  | { type: 'shoe-ended-early' };                                  // 'new-shoe' action

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: Extract<Validation, { ok: false }> };

/** What a player can know. Strategies and the Shoe tracker only ever receive this. */
export interface VisibleView {
  rules: TableRules;
  bankroll: Cents;
  bets: Slip;
  lastBets: Slip;
  history: readonly RoadEntry[];
  lastResult: HandResult | null;
  /** Unseen cards by rank (13 entries): decks × 4 − exposed. Face-down burns and cards behind the cut card are unseen. */
  unseenRanks: readonly number[];
  shoeNo: number;
  handInShoe: number;
  /** True when the next deal starts a fresh shoe (then the composition is the full shoe). */
  nextHandNewShoe: boolean;
}

// ---------- log ----------
export interface LogEntry { seq: number; action: Action; events: GameEvent[] }
```

`game.ts` signatures (not frozen beyond these):

```ts
export interface CreateGameOptions {
  rules?: Partial<TableRules>;       // resolveRules(variant defaults ⊕ overrides); throws if invalid
  bankroll?: Cents;                  // default 50_000
  seed?: number;                     // the UI seeds once from crypto.getRandomValues
  bets?: Slip;                       // preset chips on the felt (taken from the bankroll)
  forced?: ForcedHand[];
  shoe?: ShoeSetup;                  // applied at the first shuffle
  history?: RoadEntry[];             // prefill the roads (prefilled: true); does not touch the shoe
}
export function createGame(opts?: CreateGameOptions): GameState;
export function applyAction(state: GameState, action: Action): ApplyResult;
export function replay(initial: GameState, actions: readonly Action[]): GameState;
export function visibleView(state: GameState): VisibleView;
export function equity(state: GameState): Cents;            // bankroll + chips on the felt
export function legalActions(state: GameState): ActionType[];
export function queueForced(state: GameState, hands: readonly ForcedHand[]): GameState; // scenes: replaces the queue
export function startShoe(state: GameState, setup: ShoeSetup | 'fresh'): GameState;     // scenes: reshuffle now (events-free)
// tableau.ts (implemented for real in WP0: content and Drill need them)
export function cardValue(c: Card): CardValue;
export function handTotal(cards: readonly Card[]): CardValue;
export function playerDraws(total: CardValue, bankerTotal: CardValue): DrawDecision;          // natural check included
export function bankerDraws(bankerTotal: CardValue, playerTotal2: CardValue, playerThird: CardValue | null): DrawDecision;
export function playHand(next: () => Card): Omit<HandRecord, 'n' | 'shoeNo' | 'handInShoe' | 'forced'>;
```

### 1.3 The tableau (`tableau.ts`)

Deal order P1 B1 P2 B2. Totals are the sum of values mod 10.

1. **Natural**: if either two-card total is 8 or 9, both stand (`natural`).
2. **Player**: 0–5 draws (`player-0-5-draws`), 6–7 stands (`player-6-7-stands`).
3. **Banker, Player stood**: 0–5 draws, 6–7 stands (`banker-player-stood-*`).
4. **Banker, Player drew** a third card of value p:

| Banker total | Draws when p is | Rule id |
|---|---|---|
| 0, 1, 2 | always | `banker-0-2-draws` |
| 3 | anything but 8 | `banker-3-draws-unless-8` |
| 4 | 2–7 | `banker-4-draws-on-2-7` |
| 5 | 4–7 | `banker-5-draws-on-4-7` |
| 6 | 6–7 | `banker-6-draws-on-6-7` |
| 7 | never | `banker-7-stands` |

The `TABLEAU` constant is this table as a literal (rows 0–7 × p ∈ {stood, 0..9}),
shared by the Rules screen, the `tableau` content block and Drill. `bankerDraws`
reads it; the oracle (§5.1) restates the rules as if/else code without importing it.

### 1.4 Rules, variants and the bet registry (`rules.ts`, `bets.ts`)

`VARIANT_RULES[variant]` = `DEFAULT_RULES` with `variant` set. `DEFAULT_RULES`:
`decks 8, tiePays 8, commission [1, 20], cutCardFromEnd 16, afterCutCard
'one-more-hand', burn 'first-card-value', betUnit 100, mainMin 500, mainMax
100_000, sideMin 100, sideMax 10_000`. `resolveRules` rejects `decks` outside
1..8 (the exact fast path in §2.3 needs N ≤ 416), a `cutCardFromEnd` < 14 (§1.6),
and amounts that aren't multiples of `betUnit`.

| Bet | Offered in | basis | Wins when | Pays | Push |
|---|---|---|---|---|---|
| `player` | all | tableau | Player total > Banker total | 1:1 | tie |
| `banker` | punto-banco | tableau | Banker > Player | 1:1 less commission (19:20) | tie |
| `banker` | ez | tableau | Banker > Player | 1:1, **push** if Banker wins with a 3-card 7 | tie |
| `banker` | super-6 | tableau | Banker > Player | 1:1, **1:2** if Banker wins with 6 (2 or 3 cards) | tie |
| `tie` | all | tableau | totals equal | `tiePays`:1 (8 default, 9 setting) | — |
| `player-pair` | all | player-pair | Player's first two cards same rank | 11:1 | — |
| `banker-pair` | all | banker-pair | Banker's first two cards same rank | 11:1 | — |
| `dragon-bonus-player` | all | tableau | see below, from the Player's side | table | natural tie |
| `dragon-bonus-banker` | all | tableau | same, from the Banker's side | table | natural tie |
| `dragon-7` | ez | tableau | Banker wins with a 3-card 7 | 40:1 | — |
| `panda-8` | ez | tableau | Player wins with a 3-card 8 | 25:1 | — |

**Dragon Bonus** (`DRAGON_BONUS_TABLE`, one preset in v1): if the bet's side
wins with a natural, 1:1 (`natural-win`); a natural tie pushes
(`natural-tie-push`); otherwise the side must win by 4 or more points: margin 9
pays 30:1, 8 → 10:1, 7 → 6:1, 6 → 4:1, 5 → 2:1, 4 → 1:1 (`win-by-margin`). A
non-natural win by under 4 (`margin-under-4`), a non-natural tie and a loss lose.
(When the bet's side wins and either side has a natural, the winner is the natural
one, so `natural-win` is well defined.)

"Pays x:1" is always **to one**: a win returns the stake plus x × stake.
Tie in EZ and Super 6 pays 8:1 as in punto-banco (`tiePays` applies to all).

**Not simulated** (lesson text only, D3): Super 6 side bet, Either/Perfect Pair,
Big/Small, Egalité, Lucky 6, Tiger bets. Adding one = a new `BetId` (contract
change through main), a `BetDef`, a pinned edge, a felt slot. The math needs no
change for `tableau` bets.

### 1.5 Money, settlement and commission rounding (`settle.ts`)

`profitCents(amount, payout)`:
- win: `floor(amount × g0 / g1) − ceil(amount × c0 / c1)` (gross g, commission c or 0);
- push: `0`; lose: `−amount`.

**Rounding rule:** gross rounds **down** and commission rounds **up** (toward the
house), cent by cent. With `betUnit` 100 and the shipped odds (dens 1, 2, 20) the
rounding never fires: $25 Banker wins **$23.75** ($25 − $1.25), $5 at 1:2 wins
$2.50. A registry test asserts `amount × g0 % g1 === 0` and `amount × c0 % c1 ===
0` for every bet, variant and amount on the `betUnit` grid, so the exact math (no
rounding) equals the engine's cents. Commission is taken **from the win** at
settlement (modern practice); the old "commission box" owed at the end of the shoe
is lesson text only.

Money flow: `set-bet` moves chips rack ↔ felt. `deal` resolves the hand, each bet
returns `amount + profit` to the rack (0 if lost), `lastBets` = the slip, `bets` = {}.
`rebet` moves `lastBets` back (validated). `deal { rebet: true }` with an empty felt
rebets first (the "Rebet & Deal" button). An empty felt deals a no-money hand
(roads lessons, sitting out, follow-the-shoe waiting).

**Golden settlements** (punto-banco unless shown; $ net):

| Hand | Slip | Net |
|---|---|---|
| P 7 (2 cards) vs B 6 (2 cards) | Banker $25 | −25 |
| B 9 natural vs P 4 | Banker $25 | +23.75 (commission 1.25) |
| P 5 vs B 5, both 3 cards | Player $10, Tie $5 | +40 (Player push, Tie +40) |
| P K♠K♥ (0) … B wins 6 | Player Pair $5, Player $10 | +45 (pair +55, Player −10) |
| EZ: B 3-card 7 vs P 6 | Banker $20, Dragon 7 $5 | +200 (Banker push, Dragon 7 +200) |
| EZ: P 3-card 8 vs B 7 | Panda 8 $5, Player $10 | +135 |
| Super 6: B 6 (3 cards) vs P 5 | Banker $20 | +10 |
| P 9 (3 cards) vs B 0 (3 cards) | Dragon Bonus Player $10 | +300 (margin 9) |
| P natural 8 vs B natural 8 | Dragon Bonus Player $10, Banker $10 | 0 (push, push) |
| P 6 vs B 6 (non-natural tie) | Dragon Bonus Banker $10, Tie $10 | +70 (DB −10, Tie +80) |

### 1.6 Shoe, burn, cut card, forced hands (`shoe.ts`)

- **Shuffle**: `order = shuffle(rng, decks × FULL_DECK)` (Fisher-Yates: exactly
  `416 − 1` `randBelow` calls). `exposed` = zeros, `history` = [].
- **Burn** (D8): the first card is turned face up (exposed, shown on the felt and
  in the tracker), and `value` more cards are burned face down, where value = 1..9
  for A..9 and **10** for T/J/Q/K. Face-down burns stay **unseen** (they are
  unknown, so they remain in the EV composition by exchangeability).
- **Cut card** at `cutIndex = 416 − 16 = 400`. When a draw would take the card at
  `cutIndex`, a `cut-card` event fires first; the current hand completes, **one
  more hand** is dealt, `shoe-finished` fires, and the next deal reshuffles (with
  `shoe-shuffled` + `burn` events at the start of that deal). 16 cards are always
  enough: the worst case is two 6-card hands after the cut card (12). Measured over
  500 simulated shoes: 81.0 hands per shoe.
- **Unseen composition** (`unseenRanks`): `decks × 4 − Σ_suit exposed[rank, suit]`.
  This is the player's information set: dealt cards and the face-up burn card are
  seen; face-down burns and everything behind the cut card are not. It is always
  ≥ 6 cards at a deal (≥ 4 physical cards remain plus the burns). The EV math works
  on this, never on `order`.
- **Forced hands**: on `deal`, if `forced` is non-empty, its head is validated
  (§1.7) and its cards are placed at the next draw positions in deal order: for
  each forced card, find its first copy at index ≥ `pos` in `order` and swap it into
  place. The swap keeps the composition exact and the rest of the order seeded. If a
  forced card has no copy left at or after `pos`, the engine **reshuffles first**
  (new shoe, events emitted), so a forced hand can never dead-end. Forced cards
  count against the cut card like any others.
- **`ShoeSetup`** (scenes: rich or poor shoes): applied right after the shuffle and
  burn. `removed` swaps the requested cards to the next positions and deals them
  out face up (exposed, as if dealt in earlier hands); `startAtCard` then advances
  `pos` to that index (those cards count as seen).
  The validator checks that removals leave ≥ 40 cards before the cut card.

### 1.7 Validation (`validateAction`, pure; first failure wins)

- `set-bet`: the bet is offered by the variant (`not-offered`); amount ≥ 0 and a
  multiple of `betUnit` (`bad-amount`); 0 or within the bet's limits
  (`below-min`/`above-max`); the change ≤ bankroll (`insufficient-funds`).
- `rebet` / `deal {rebet}`: `lastBets` non-empty (`no-last-bets`), every bet
  still offered (a variant change drops bets that aren't), and affordable.
- `deal`: a forced head must pass `validateForcedHand` (`bad-forced-hand`): every
  code parses, 2 or 3 cards per side, at most `decks` copies of any code, and the
  third cards present **exactly** when `playerDraws`/`bankerDraws` say so.
- `clear-bets`, `new-shoe`: always valid.

### 1.8 Event order of one `deal`

`[shoe-shuffled, burn]` (new shoe only) → `hand-started` → `card-dealt` P1, B1,
P2, B2 (`cut-card` before whichever card reaches the cut) → `pause-point two-cards`
→ `natural` (if any) → `draw-decision player` → `card-dealt player 2` (if drawn) →
`pause-point player-third` → `draw-decision banker` → `card-dealt banker 2` (if
drawn) → `pause-point all-cards` → `hand-result` → `road-updated` → `bet-settled` ×
placed bets in `BET_IDS` order → `hand-settled` → `shoe-finished` (if this was the
extra hand). The pause markers carry no state; the UI and scenes use them to stop
the reveal (§4.3). Draw decisions are emitted on naturals too (`rule: 'natural'`),
so every hand answers "does the Player/Banker draw?".

---

## 2. EV module (`src/sim/math/`)

### 2.1 Files

```
src/sim/math/
  types.ts        // FROZEN (§2.2)
  fraction.ts     // verbatim from holdumb ({num, den}, frac, add, mul, cmp, toNumber, ...)
  distribution.ts // outcomeDistribution(ranks): the tableau enumeration (Number fast path + bigint path)
  evs.ts          // betEvs(dist, rules): EV/edge/P(win/push/lose)/sd per bet from the registry's settle()
  edges.ts        // fullShoeEvs(rules) (memoized per variant × tiePays × decks), PINNED constants, perHour()
  preview.ts      // previewSlip(req): the EV sheet + the slip + alternative + needsConfirm
  tiers.ts        // betTier(edge), thresholds as constants
  explain.ts      // why(bet, dist, rules): rows with counts, fractions, formula
  tracker.ts      // shoeTracker(view, rules): current-shoe EVs vs full shoe (D6)
  index.ts
```

Previews are **synchronous** direct calls from `ui` (architecture Plan A). No worker.

### 2.2 `math/types.ts` (frozen with the engine contract)

```ts
// ===== src/sim/math/types.ts — FROZEN =====
import type { BetId, Cents, TableRules, CardValue } from '../engine/types';

/** Exact rational, normalized: den > 0, gcd(|num|, den) = 1. Structured-cloneable. */
export interface Fraction { num: bigint; den: bigint }

/** One cell of the tableau outcome histogram. */
export interface OutcomeCell {
  playerTotal: CardValue; bankerTotal: CardValue;
  playerCards: 2 | 3; bankerCards: 2 | 3;
  /** Number of ordered 6-card sequences (from the unseen cards) that produce this cell. */
  weight: bigint;
}
export interface OutcomeDistribution {
  cardsLeft: number;                 // N unseen cards
  /** N(N−1)(N−2)(N−3)(N−4)(N−5): all ordered sequences of the next six cards. Σ weight = total. */
  total: bigint;
  cells: readonly OutcomeCell[];     // non-zero cells only (205 for any 1–8 deck full shoe)
  /** P(first two cards of a hand have the same rank) = Σ r_k(r_k − 1) / (N(N − 1)). Same for both sides. */
  pPair: Fraction;
  pairCount: bigint;                 // Σ r_k(r_k − 1)
  pairOutOf: bigint;                 // N(N − 1)
}

export type BetTier = 'free' | 'good' | 'fair' | 'costly' | 'sucker';

export interface WhyRow {
  id: string;                        // 'win' | 'push' | 'lose' | 'win-3card-7-push' | 'margin-9' | 'natural-win' …
  label: string;                     // 'Banker wins (you get 0.95)'
  count: bigint;                     // equally likely ordered deals (or card pairs for Pair bets)
  outOf: bigint;
  probability: Fraction;
  /** Net per $1 bet in this row (0.95, 0, −1, 30 …). */
  net: Fraction;
  /** probability × net. Rows sum exactly to ev. */
  contribution: Fraction;
}
export interface WhyBreakdown {
  rows: WhyRow[];
  casesLabel: string;                // 'orderings of the next six cards' | 'two-card starts'
  formula: string;                   // '0.4586 × 0.95 − 0.4462 × 1 = −0.01058'
  note?: string;                     // 'Ties push: excluding ties the edge is 1.17%.'
}

export interface BetEv {
  bet: BetId;
  offered: boolean;
  /** Expected net per $1 bet, per hand (ties push for Player/Banker). */
  ev: Fraction;
  /** House edge per bet placed = −ev (the primary metric). */
  edge: Fraction;
  /** Player/Banker only: edge per resolved bet (ties excluded). */
  edgePerResolved?: Fraction;
  pWin: Fraction; pPush: Fraction; pLose: Fraction;
  /** Standard deviation per $1 (display and charts only). */
  sd: number;
  tier: BetTier;
  why: WhyBreakdown;
}

export interface PreviewRequest {
  rules: TableRules;
  slip: Readonly<Partial<Record<BetId, Cents>>>;
  /** Unseen cards by rank (13). Omit for the full shoe (the EV sheet's default, D6). */
  unseenRanks?: readonly number[];
  handsPerHour: number;              // 72 (D5)
}
export interface SlipLine {
  bet: BetId;
  amount: Cents;
  evCents: Fraction;                 // amount × ev
  perHourCents: Fraction;            // evCents × handsPerHour
  tier: BetTier;
}
export interface Alternative {
  /** The costliest-per-$ bet on the slip that has a cheaper main bet available. */
  from: BetId;
  to: BetId;                          // the lowest-edge offered main bet (banker in punto-banco/ez, player in super-6)
  amount: Cents;                      // same amount moved
  fromEvCents: Fraction; toEvCents: Fraction;
  savingPerHourCents: Fraction;
}
export interface SlipPreview {
  source: 'full-shoe' | 'current-shoe';
  cardsLeft: number;
  /** Every bet the variant offers, BET_IDS order (the EV sheet). */
  sheet: BetEv[];
  lines: SlipLine[];                 // the bets on the slip
  totalWagered: Cents;
  totalEvCents: Fraction;
  perHourCents: Fraction;
  alternative: Alternative | null;
  /** Bets on the slip in the 'sucker' tier: a second tap when confirmCostlyBets is on. */
  needsConfirm: BetId[];
  exact: true;
}

/** Shoe tracker (D6): current-shoe values next to the full-shoe ones. */
export interface TrackerRow {
  bet: BetId;
  ev: Fraction;                      // current shoe
  fullShoeEv: Fraction;
  delta: Fraction;                   // ev − fullShoeEv
  positive: boolean;                 // ev > 0: "the shoe favours this bet right now"
}
export interface TrackerView {
  cardsLeft: number;
  unseenByValue: readonly number[];  // 10 entries, value 0..9
  rows: TrackerRow[];
  nextHandNewShoe: boolean;          // then rows equal the full-shoe values
}
```

API (`math/index.ts`):

```ts
export function outcomeDistribution(unseenRanks: readonly number[]): OutcomeDistribution; // memo by key
export function betEvs(dist: OutcomeDistribution, rules: TableRules): BetEv[];
export function fullShoeEvs(rules: TableRules): BetEv[];        // memoized; equals PINNED (§2.5) in tests
export function previewSlip(req: PreviewRequest): SlipPreview;  // sync
export function shoeTracker(view: VisibleView): TrackerView;    // sync
export function betTier(edge: Fraction): BetTier;
export function perHourCents(evCents: Fraction, handsPerHour: number): Fraction;
```

### 2.3 How the EV is computed

**Single source of truth.** `betEvs` never restates a payout: for every cell it
builds a `TableauOutcome` and calls the registry's `BetDef.settle(outcome, rules)`,
then converts the `Payout` to an exact net per $1 (`gross − commission`, 0, or −1).
`tableau` bets read only totals and card counts, so pair flags are set to false;
the two Pair bets are evaluated from `pPair` by calling `settle` with the flag true
and false. A property test (§5.2) proves each bet reads only its `basis`.

**Enumeration.** Let c[v] be the unseen count of value class v (0..9; class 0 =
T/J/Q/K) and N = Σ c. Deal P1, B1, P2, B2 by looping over values with weights
c[v], decrementing as cards are taken (weights are falling products, so the
sequence probabilities are exact for drawing without replacement). After four
cards: natural → leaf; else apply `playerDraws`, then `bankerDraws`, looping the
third cards the same way. Every leaf is padded to the common denominator
N(N−1)(N−2)(N−3)(N−4)(N−5) by multiplying with the falling factors of the unused
positions, and its weight is added into one of **400 cells** (playerTotal ×
bankerTotal × playerCards × bankerCards). Each bet's EV is then
Σ cell.weight × net(cell) / total.

**Op count** (full 8-deck shoe; measured):
- ≤ 10⁴ four-card prefixes; **339,400 leaves**, one multiply-add each;
- 205 non-zero cells; then 9 bets × 205 cells of bigint multiply-adds (≈ 1,850)
  and one gcd per bet.

**Number fast path, exact.** Every weight and every partial sum is an integer ≤
416·415·414·413·412·411 = **4,998,398,275,503,360 < 2^53** (9.007·10^15), so the
loop runs in plain `number`s with **no rounding at all** for any shoe of up to 8
decks. That's why `resolveRules` caps `decks` at 8. The histogram is converted to
`bigint` once (400 values) and the bet sums are bigint fractions. A `bigint`
path (`distributionBig`) is kept for tests and asserts identical histograms.

**Measured** (`bench.mjs`, Node 22, this container):

| Step | Time |
|---|---|
| Histogram, Number path, full shoe | **1.35 ms** |
| Histogram, bigint path, full shoe | 13.9 ms |
| Exact bigint-fraction EV of 9 bets from the histogram | 0.50 ms |
| Float EV of 9 bets (for comparison) | 0.09 ms |
| Histogram + exact EVs, 200 random depleted shoes | mean 1.1–1.3 ms, worst 3.9 ms |
| Live recompute after every hand, 500 real shoes (40,512 hands) | p50 1.40 ms, p99 3.05 ms |
| Same with `--jitless` (interpreter only; a worst-case phone proxy) | full shoe 47.7 ms; depleted mean 31 ms, worst 86 ms |

Number vs bigint histograms are identical; both match the Python enumerator to the
last digit. A mid-range Android phone is roughly 4–6× slower than this desktop
with the JIT on, so **6–10 ms** per recompute (and ≤ 50 ms even interpreted).

**Decisions from the numbers:**
1. **No Web Worker** (architecture Plan A). The EV sheet is a sync call in the same
   frame; full-shoe values are computed once per (variant, tiePays, decks) on first
   use and memoized (1.4 ms), not hard-coded, so the preview always comes from the
   registry; the pinned constants are only test oracles.
2. **The Shoe tracker updates live after every hand** (D6). It is computed on
   `hand-settled`, inside the ~1 s reveal animation, so it never delays input. The
   container memoizes by the 13-count key; perf budget: < 30 ms at 4× throttle
   (architecture §4.5), with the bigint path never used at runtime.
3. Strategies and simulations use the **full-shoe** EVs for their "expected" line
   (§6.3); they never enumerate per hand.

### 2.4 Tiers

On the edge per bet placed (exact comparisons; constants in `tiers.ts`):

| Tier | Edge | Badge text | Colour token | Confirm |
|---|---|---|---|---|
| `free` | ≤ 0 | "No house edge" (Shoe tracker: "Edge to you") | `--tier-free` (teal) | one tap |
| `good` | ≤ 2% | "Good bet" | `--tier-good` (green) | one tap |
| `fair` | ≤ 5% | "Fair" | `--tier-fair` (yellow) | one tap |
| `costly` | < 9% | "Costly" | `--tier-costly` (orange) | one tap + alternative card |
| `sucker` | ≥ 9% | "Sucker bet" | `--tier-sucker` (red) | **second tap** ("Bet it anyway") when `confirmCostlyBets` (default on) |

Full-shoe tiers: Banker (all three variants) and Player `good`; Tie 9:1 and Dragon
Bonus Player `fair`; Dragon 7 `costly`; Tie 8:1, both Pairs, Panda 8 and Dragon
Bonus Banker `sucker`. The text label always accompanies the colour.

### 2.5 Pinned full-shoe values (8 decks; must equal curriculum.md's reference table)

Exact, per bet placed, ties push. These are `edges.ts` `PINNED` test constants.

| Bet (variant) | EV per $1 (exact) | Edge | P(win) | P(push) | SD | $/h at $10 × 72 |
|---|---|---|---|---|---|---|
| Banker (punto-banco, 5%) | −114753351728/10847218479825 | **1.0579%** | 0.458597 | 0.095156 | 0.9274 | $7.62 |
| Player (all) | −241149546272/19524993263685 | **1.2351%** | 0.446247 | 0.095156 | 0.9512 | $8.89 |
| Banker (ez) | −66274384744/6508331087895 | **1.0183%** | 0.436064 | 0.117690 | 0.9393 | $7.33 |
| Banker (super-6) | −284694798368/19524993263685 | **1.4581%** | 0.458597 | 0.095156 | 0.9296 | $10.50 |
| Tie 8:1 | −103841353768/723147898655 | **14.3596%** | 0.095156 | — | 2.6409 | $103.39 |
| Tie 9:1 | −63053127805/1301666217579 | **4.8440%** | 0.095156 | — | 2.9343 | $34.88 |
| Player Pair / Banker Pair 11:1 | −43/415 | **10.3614%** | 31/415 = 0.074699 | — | 3.1549 | $74.60 |
| Dragon Bonus Player | −103547854751/3904998652737 | **2.6517%** | 0.289887 | 0.017871 | 2.4736 | $19.09 |
| Dragon Bonus Banker | −9683026823/103306842665 | **9.3731%** | 0.282795 | 0.017871 | 2.3045 | $67.49 |
| Dragon 7 40:1 (ez) | −64613588827/848912750595 | **7.6113%** | 0.022534 | — | 6.0849 | $54.80 |
| Panda 8 25:1 (ez) | −153010345753/1501922558745 | **10.1876%** | 0.034543 | — | 4.7481 | $73.35 |

Hand probabilities (denominator 4,998,398,275,503,360 ordered six-card sequences):
Player wins 2,230,518,282,592,256 = **8712962041376/19524993263685 ≈ 44.6247%**,
Banker wins 2,292,252,566,437,888 = **8954111587648/19524993263685 ≈ 45.8597%**,
Tie 475,627,426,473,216 = **619306544887/6508331087895 ≈ 9.5156%**.
Per resolved bet (ties excluded): Banker **21516253449/1840320169690 ≈ 1.1692%**,
Player **7535923321/552096050907 ≈ 1.3650%**.
Other pinned facts: P(either side has a natural) = 158222458/461223945 ≈ 34.30%;
P(Player draws) = 15479099/30748263 ≈ 50.34%; P(Banker draws) =
4136876519/9501213267 ≈ 43.54%; P(Banker wins with a 3-card 7) =
19129247848/848912750595 ≈ 2.2534%; P(Banker wins with 6) =
210337737856/3904998652737 ≈ 5.3864%; E[cards per hand] =
46924771178/9501213267 ≈ 4.9388.

These match the published 8-deck figures (Banker 1.06%, Player 1.24%, Tie
14.36% / 4.84%, EZ Banker 1.02%, Dragon 7 7.61%, Panda 8 10.19%, Pairs 10.36%,
Dragon Bonus 2.65% / 9.37%, Super 6 Banker 1.46%). "Banker is the best bet" holds in punto-banco and EZ; **in Super 6 the
Player (1.24%) is cheaper than the Banker (1.46%)**, and the alternative card
says so (§2.6). Curriculum.md's table must use these fractions; a mismatch is
a decisions.md item.

### 2.6 EV sheet, preview, alternative, "Why?"

`previewSlip` is called on every chip change (sub-ms with the memoized full-shoe
values). The sheet lists every offered bet: label, payout text, edge %, tier
badge, and for bets on the slip "−$0.11 per hand · −$7.62/hour". The slip footer
(Banker $25 + Tie $10): "This slip: $35 per hand, expected −$1.70 per hand,
−$122.43/hour".

**Better alternative** (computed, no curated list): the lowest-edge offered main
bet `best` (ties of the edge → Banker). For each slip line whose edge exceeds
`best`'s, the alternative is the one with the largest per-hour saving: *"Banker
instead of Tie: −$0.11 vs −$1.44 per $10 hand, $95.77 less per hour at 72 hands."*
with "Use this" (moves the amount). Player → Banker in punto-banco/EZ is offered
as a small `good`-tier tip (saves $1.28/hour at $10); in Super 6 the tip is
Banker → Player. Side bets are additive, so "Use this" on a side bet removes it
and adds the amount to `best`.

**"Why?"** (`explain.ts`), rows with real deciding outcomes, counted over the
ordered six-card sequences (or two-card starts for Pairs). Pinned examples:

*Banker (punto-banco):*

| Row | Count (of 4,998,398,275,503,360) | P | Net per $1 |
|---|---|---|---|
| Banker wins | 2,292,252,566,437,888 | 45.8597% | +0.95 |
| Tie (push) | 475,627,426,473,216 | 9.5156% | 0 |
| Player wins | 2,230,518,282,592,256 | 44.6247% | −1 |
| **EV** | | | 0.458597 × 0.95 − 0.446247 = **−1.0579%** |

Note: *"Banker wins more often, so the casino charges 5% on Banker wins. Excluding
ties the edge is 1.17%."*

*Player Pair 11:1:* 13 × 32 × 31 = 12,896 pair starts of 416 × 415 = 172,640:
P = 31/415; EV = 31/415 × 11 − 384/415 = −43/415 = −10.36%.

*Dragon Bonus Player:* rows natural win 16.2589% (+1), natural tie 1.7871% (0),
win by 9 0.3683% (+30), by 8 0.6822% (+10), by 7 1.7924% (+6), by 6 2.8257% (+4),
by 5 3.3244% (+2), by 4 3.7368% (+1), everything else 69.2242% (−1); sum
−2.6517%. (Banker side: natural rows identical; margins 9 0.3079%, 8 0.5663%,
7 1.5909%, 6 2.3848%, 5 3.1465%, 4 4.0242%; lose 69.9334%; sum −9.3731%. The
Banker draws more cleverly, so it wins by big margins less often.)

### 2.7 Exact figures vs estimates

| Figure | Kind | UI label |
|---|---|---|
| Bet EVs, edges, tiers, probabilities, $/hand, $/hour, full shoe and Shoe tracker | **exact** | "−1.06%", exact fraction in "Why?" |
| A system's expected line (Σ bet × full-shoe EV of the bets it actually placed) | exact given the bets, full-shoe approximation of a real shoe | "Expected (house edge × money bet)" |
| Simulated bankroll paths, percentiles, bust rate, P(ahead), cap hits | **estimate** | "≈ … (simulated, 100 sessions)" |
| Shoe-tracker frequency facts in lessons (e.g. "Dragon 7 had the edge on ≈ 11.6% of hands") | **estimate** | "≈ simulated over 500 shoes" |

From `shoe.mjs` (500 real shoes, seed 777, exact EV after every hand; lessons may
quote these as "≈ simulated"): the share of hands where a bet had positive EV for
the cards left: Banker 0.20%, Player 0.15%, EZ Banker 0.47%, Tie 8:1 0.10%,
Dragon 7 11.6%, Panda 8 5.8%, Dragon Bonus Player 8.3%, Dragon Bonus Banker 1.2%.
This is the material for the counting lesson: the main bets almost never turn,
the EZ side bets do, but only near the end of the shoe and at small bet sizes.

---

## 3. Scoreboards / roads (`engine/roads.ts`)

### 3.1 Data

`roadEntry(hand: HandRecord): RoadEntry` (winner, pair flags, natural, winning or
tied total). `GameState.history` holds this shoe's entries (scene prefill entries
first, `prefilled: true`). Both roads are pure functions of the list, so a
replay rebuilds them exactly.

### 3.2 Bead plate (`beadPlate(entries, rows = 6)`)

Every hand, ties included, one bead per hand, filled **column by column, top to
bottom, left to right**: entry i → `col = floor(i / 6)`, `row = i % 6`. Bead:
red circle "B" (Banker), blue "P" (Player), green "T" (Tie); a small red dot at
the top-left for a Banker pair and a blue dot at the bottom-right for a Player
pair. Optional "show totals" setting draws the winning total instead of the
letter. The UI shows the last ⌈visible columns⌉ and scrolls horizontally inside
its strip only (the page never scrolls sideways).

### 3.3 Big Road (`bigRoad(entries, rows = 6)`)

1. Ties make no cell. A tie adds 1 to `ties` of the **latest** cell (green slash;
   a number when > 1). Ties before the first Player/Banker result of the shoe are
   counted in `leadingTies` and drawn on the first cell when it arrives.
2. A Player/Banker result equal to the current streak's winner **continues the
   streak**; a different one **starts a new streak**.
3. A new streak k is placed at row 0 of the first column, scanning right from
   (start column of streak k−1) + 1, whose row 0 is empty.
4. A continuing result goes **down** one row if that row is < 6, the cell is empty,
   and the streak has not turned yet; otherwise it **turns right** ("dragon tail")
   and keeps going right on the same row for the rest of the streak.
5. Cells are hollow rings: red for Banker, blue for Player; pair dots as on the
   bead plate.
6. `streaks` lists the logical streak lengths (independent of the dragon-tail
   placement).

Pinned fixtures (rows = 6; `X(col,row)`, `+nT` = ties on that cell; computed with
`/tmp/baccaratton-scratch/simulator/road.py`, which implements rules 1–6):

| Entries | Cells |
|---|---|
| `T B B B B B B B P T P B` | leadingTies 1; B(0,0) … B(0,5), B(1,5) (tail); P(1,0)+1T, P(1,1); B(2,0) |
| `B×8 P×7` | B(0,0) … B(0,5), B(1,5), B(2,5); P(1,0) … P(1,4) (blocked by the tail at (1,5)), P(2,4), P(3,4) |
| `P B×8 P B×7` | P(0,0); B(1,0) … B(1,5), B(2,5), B(3,5); P(2,0); B(3,0) … B(3,4), B(4,4), B(5,4) |

### 3.4 Derived roads (explained only, D4)

Big Eye Boy, Small Road and Cockroach Pig use k = 1, 2, 3 on the Big Road's
**logical** columns (streaks, ignoring dragon-tail placement). For each new
result at logical column c, depth r (0 = first of the column):
- r = 0: **red** if columns c−1 and c−1−k have the same length, else **blue**;
- r ≥ 1: look at column c−k: **red** if it has a result at depth r; **blue** if it
  has one at depth r−1 but not at depth r; **red** if it has neither (the column
  already ended earlier: "both empty").
- A road starts with the first result whose referenced column exists (Big Eye Boy:
  column 1 depth 1, or column 2 depth 0, whichever comes first).
Red means "the pattern repeats", blue "it breaks". They predict nothing: hands are
close to independent of the past. The curriculum explains them with a static
picture; `roads.ts` exports `derivedRoad(big, k)` only if a chip asks for it (not
in v1).

`roadCounts(entries)` → { banker, player, tie, bankerPair, playerPair, naturals }
for the scoreboard header.

---

## 4. Rendering (`src/sim/ui/`)

### 4.1 Approach

holdumb's pattern: **SVG** felt with data-driven layouts (cards, chip stacks, bet
spots, labels), **HTML** for the action bar, chip rack, roads strip, EV sheet,
toasts, step panel, Shoe tracker and auto-play panel. Presentational components
take plain props; only `Simulator.tsx` (integration) owns state.

```ts
// src/sim/ui/layouts/types.ts (table-ui owns)
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface FeltLayout {
  viewBox: { w: number; h: number };
  card: { w: number; h: number };            // upright; a sideways third card is h × w
  hands: Record<Side, { cards: [Pt, Pt]; third: Pt; label: Pt; total: Pt }>;
  spots: Partial<Record<BetId, Rect>>;       // only the variant's offered bets
  shoe: Pt; discard: Pt;                     // cards fly from / to
  rack: Pt;
  minTapUnits: number;                       // 44 CSS px in viewBox units at the reference viewport
}
export function feltLayout(o: 'portrait' | 'landscape', variant: VariantId): FeltLayout;
```

Cards: SVG `<g>`: rounded rect, rank + suit corner, big centre pip, 2- or 4-colour
suits (`fourColorDeck`), navy-on-burgundy back. The third card is drawn rotated
90° ("sideways"), the casino convention. Accessible name "King of hearts". Card
**values** show as a small total badge per hand ("Player 7").

### 4.2 Portrait (felt viewBox 0 0 390 432; at 390 CSS px, 1 unit = 1 px)

| Element | Geometry (x, y, w, h) |
|---|---|
| "PLAYER" label + total badge | centre (97, 18); badge at (150, 18) |
| "BANKER" label + total badge | centre (293, 18); badge at (346, 18) |
| Player cards | (37, 34) and (99, 34), card 56×78 |
| Player third (sideways) | (58, 118), 78×56 |
| Banker cards | (233, 34) and (295, 34) |
| Banker third (sideways) | (254, 118), 78×56 |
| Shoe / discard | shoe (370, 60) off the right edge, cards slide in; discard (−20, 60) |
| Main spots | Player (16, 186, 116, 100) · Tie (137, 186, 116, 100) · Banker (258, 186, 116, 100) |
| Side row | Player Pair (16, 296, 84, 60) · DB Player (106, 296, 84, 60) · DB Banker (200, 296, 84, 60) · Banker Pair (290, 296, 84, 60) |
| EZ row (ez only) | Panda 8 (16, 366, 175, 56) · Dragon 7 (199, 366, 175, 56) |

Each spot shows its label, payout ("11:1"), chips, and when EV is on a tier badge
with its edge ("Good · −1.06%"). Without EZ the felt is 0 0 390 366.

Below the felt (HTML): the **roads strip** (bead plate 6 × 18 px rows, Big Road
toggle, tap to expand; collapsible), the **chip rack** ($1 $5 $25 $100 $500, each
≥ 48 px), then the **action bar**: **Deal** (primary, shows "Slip $35 · EV −$1.70"),
**Rebet**, **Clear**, and **EV** (opens the sheet). Budget at 390×844: header 48 +
status 40 (bankroll · on felt · shoe meter "312 cards left" · session ±) + felt 432 +
roads 116 + chips 56 + actions 64 = 756, + tab bar 56 = 812 ≤ 844. Shorter phones
scale the felt by `meet`; the roads strip collapses first.

Interaction: pick a chip, tap a spot to add it, long-press (or the stack) opens the
spot sheet (+/−, remove, payout, edge, "Why?"). Tapping a `sucker`-tier spot with
`confirmCostlyBets` places the chip only after the second tap in the inline
confirm ("Tie loses $1.44 per $10. Bet it anyway?").

### 4.3 Landscape (844×390): felt viewBox 0 0 520 390 + right rail 324 px

| Element | Geometry |
|---|---|
| Player cards / third | (40, 26), (100, 26), card 54×76; third sideways (160, 36) 76×54 |
| Banker cards / third | (288, 26), (348, 26); third (408, 36) |
| Labels + totals | y 14 |
| Main spots | Player (16, 132, 156, 96) · Tie (182, 132, 156, 96) · Banker (348, 132, 156, 96) |
| Side row | 4 × (116 × 56) at y 238, x = 16, 138, 260, 382 |
| EZ row | Panda 8 (16, 304, 238, 56) · Dragon 7 (266, 304, 238, 56) |

The rail holds, top to bottom: the step panel (scenes), the action bar (**Deal
always visible**, each button ≥ 52 px), the chip rack (2 rows), the compact EV list
(every spot's edge + badge), and the bead plate. The full EV sheet and "Why?" open
as a rail panel. 863×360 (Pixel 7) keeps the rail; the felt scales by `meet`.

### 4.4 Animation and pacing (`animation.ts`)

The engine resolves instantly; `buildTimeline(events, speed)` turns events into
steps (only transform and opacity animate):

| Step | normal | fast | instant |
|---|---|---|---|
| Card slides from the shoe (each of P1 B1 P2 B2) | 110 ms | 50 | 0 |
| Flip both two-card hands + totals | 220 | 80 | 0 |
| Player third card (slide + flip, sideways) | 220 | 80 | 0 |
| Banker third card | 220 | 80 | 0 |
| Result banner + winning spot glow | 200 | 80 | 0 |
| Chips pay / sweep | 300 | 120 | 0 |

A hand with no third cards takes ≈ 1.16 s (normal), ≈ 0.44 s (fast); with both
third cards ≈ 1.6 s / 0.6 s. Tap anywhere to skip to the end. OS reduced motion or
the setting forces `instant` with 150 ms fades. Auto-play "Watch" uses `fast`.
`pause-point` events end a timeline segment: the container stops there when a
scene step or Drill asks (§5.2). Burn and shuffle: a 400 ms "New shoe"
banner and the burn card shown face up for 600 ms (normal), skippable.
No squeeze (D7).

### 4.5 Accessibility

Spots are `role="button"`: "Banker, $25 on it. Pays 1 to 1 less 5%. Good bet,
house edge 1.06%." Cards `role="img"`. The result is announced `aria-live=polite`
("Banker wins, 7 to 5. You win $23.75 after $1.25 commission."). The EV sheet is a
focus-trapped dialog. Tier never by colour alone. Roads have a text alternative
("Last 10: B B P T B …; Banker 23, Player 19, Tie 4"). Felt text ≥ 4.5:1 on
burgundy `#5c1a2b` (gold `#d4af37` labels pass on it at ≥ 14 px bold; body text is
`#f5ecd7`).

### 4.6 UI files (owner in brackets)

```
src/sim/ui/
  Simulator.tsx  StepPanel.tsx  PredictBar.tsx  persist.ts  settings.ts   [integration]
  Felt.tsx  Card.tsx  HandView.tsx  BetSpot.tsx  ChipStack.tsx            [table-ui]
  ActionBar.tsx  ChipRack.tsx  StatusBar.tsx  ShoeMeter.tsx  Toasts.tsx   [table-ui]
  EvSheet.tsx  EvList.tsx  WhyTable.tsx  TierBadge.tsx  AltCard.tsx       [table-ui]
  Scoreboard.tsx (BeadPlate + BigRoad)  ShoeTracker.tsx  Tableau.tsx     [table-ui]
  AutoPlayPanel.tsx  BankrollChart.tsx  SurvivalChart.tsx  OutcomeHistogram.tsx  [strategy]
  layouts/{portrait,landscape,index,types}.ts  animation.ts  text.ts  types.ts  sim.css  [table-ui]
  gallery.tsx  (dev-only, driven by the REAL engine + math)               [table-ui]
```

`ui/types.ts` holds `SimSettings` (architecture §2.4) with these ids:
`variant: VariantId` (architecture's `commission: 'classic' | 'ez' | 'super-6'`
becomes `variant` with `'punto-banco'` for classic), `tiePays: TiePays`,
`animationSpeed`, `fourColorDeck`, `unitCents`, `handsPerHour` (72),
`confirmCostlyBets`, `practice`, `showRoads`, `shoeTracker` (default false, D6).

---

## 5. Scenes (`src/sim/scene/`)

### 5.1 `scene/types.ts` (frozen with the engine contract)

```ts
// ===== src/sim/scene/types.ts — FROZEN =====
import type { Action, ActionType, BetId, Cents, ForcedHand, GameEvent, PausePoint,
  RoadEntry, ShoeSetup, TiePays, VariantId, Winner } from '../engine/types';
import type { StrategyId, StrategySpec } from '../strategy/types';

export type RoadId = 'bead-plate' | 'big-road';
/** Things a learner can tap that scenes can wait for (emitted even when set-bet is gated). */
export type TapTarget = BetId | 'commission' | 'bead-plate' | 'big-road' | 'shoe-tracker' | 'ev-sheet' | 'session';
export type PredictKind = 'player-draws' | 'banker-draws' | 'hand-total' | 'winner';
export type HistoryCode = 'B' | 'P' | 'T' | RoadEntry;  // 'B' = banker win, no pairs, total 7

export interface SceneUi {
  orientation?: 'auto' | 'portrait' | 'landscape';
  chips?: Cents[]; defaultChip?: Cents;
  showChipRack?: boolean; showBankroll?: boolean; showSession?: boolean;
  roads?: RoadId[];                   // default ['bead-plate', 'big-road'] when showRoads
  shoeTracker?: boolean;              // default false (D6)
  showSettings?: boolean;             // default false in scenes
  speed?: 'normal' | 'fast' | 'instant';
  compact?: boolean;
}

export interface SceneConfig {
  id: string;                         // 'l07-s1'
  version: 1;
  title?: string;
  variant?: VariantId;                // default 'punto-banco'
  tiePays?: TiePays;
  bankroll?: Cents;                   // default 50_000
  bets?: Partial<Record<BetId, Cents>>; // preset chips on the felt
  seed?: number;                      // default 1 in guided scenes, random in free ones
  shoe?: 'fresh' | ShoeSetup;         // default 'fresh'
  deals?: ForcedHand[];               // scene-level queue (prefer step deals)
  onDealsExhausted?: 'random' | 'block'; // default 'random'
  history?: HistoryCode[];            // prefill the roads (does not touch the shoe)
  allowedActions?: ActionType[];      // default all
  allowedBets?: BetId[];              // default all offered
  highlight?: (BetId | TapTarget)[];
  showEV?: boolean;                   // default true
  evDetail?: 'basic' | 'full';        // basic = edge + badge; full = + alternative + Why?
  whyOpen?: BetId;                    // open "Why?" for this bet
  practice?: boolean;                 // hide EV until the hand settles
  ui?: SceneUi;
  autoPlay?: {
    enabled: boolean;
    strategies?: StrategyId[];
    defaultStrategy?: StrategySpec;
    handOptions?: number[];           // default [72, 720, 7200] (1 h, 10 h, 100 h)
    sessions?: number[];              // default [1, 100]
    compare?: StrategySpec[];         // side-by-side on the same seed
  };
  steps?: SceneStep[];
}

export interface SceneStep {
  id: string;
  text: string;                       // **bold**, _italic_, {{Kh 7d}} inline cards
  hint?: string;                      // after a rejected action, a wrong prediction or 20 s idle
  math?: string;                      // "Show the math" body
  setup?: { bankroll?: Cents; bets?: Partial<Record<BetId, Cents>> };
  /** Replaces the deal queue at step start. Put forced hands ON THE STEP THAT DEALS THEM. */
  deals?: ForcedHand[];
  /** Reshuffle at step start ('fresh' or a rich/poor shoe). */
  shoe?: 'fresh' | ShoeSetup;
  allowedActions?: ActionType[];
  allowedBets?: BetId[];
  highlight?: SceneConfig['highlight'];
  expect?: ActionMatcher[];           // only matching actions are accepted
  /** Staged reveal: stop the deal animation here (with predict, wait for the answer). */
  pauseAt?: PausePoint;
  predict?: { kind: PredictKind; side?: 'player' | 'banker' }; // side for hand-total
  completeWhen: Condition;
  advance?: 'auto' | 'button';        // default 'auto'
  showEV?: boolean;
  ui?: Pick<SceneUi, 'shoeTracker' | 'roads'>;
}

export interface ActionMatcher {
  type: ActionType;
  bet?: BetId | BetId[];              // set-bet only
  amount?: Cents; minAmount?: Cents; maxAmount?: Cents;
}

export type Condition =
  | { all: Condition[] } | { any: Condition[] }
  | { action: ActionMatcher; count?: number }               // accepted since step start
  | { event: GameEvent['type']; count?: number }
  | { hands: number }                                       // hands settled since step start
  | { handResult: { winner?: Winner; natural?: boolean; minNet?: Cents } }
  | { betOnFelt: { bet: BetId; minAmount?: Cents } }
  | { bankrollAtLeast: Cents } | { bankrollAtMost: Cents }  // equity
  | { previewed: { bet?: BetId; whyOpened?: boolean } }     // EV sheet / spot sheet opened on that bet
  | { tapped: TapTarget }
  | { predicted: { correct?: boolean; count?: number; kind?: PredictKind } }
  | { autoPlayCompleted: { minHands?: number; strategy?: StrategyId } }
  | { trackerPositive: { bet?: BetId } }                    // the Shoe tracker shows a +EV bet
  | { acknowledged: true };

export interface SceneRuntime {
  stepIndex: number; stepStartHand: number; counters: Record<string, number>;
  done: boolean; satisfied?: boolean;
}
export type SceneInput =
  | { kind: 'action'; action: Action; events: GameEvent[] }
  | { kind: 'previewed'; bet: BetId; whyOpened: boolean }
  | { kind: 'tapped'; target: TapTarget }
  | { kind: 'predicted'; predict: PredictKind; answer: string; correct: boolean }
  | { kind: 'tracker'; positive: BetId[] }
  | { kind: 'acknowledged' }
  | { kind: 'auto-play-completed'; hands: number; strategy: StrategyId };
```

Runner API (pure, holdumb names): `initScene`, `currentStep`, `activeGate`,
`gateAction` (returns `not-allowed-by-scene` with the step's hint), `observe(scene,
rt, input, ctx) → rt`, `answerKey(step, hand) → { answer, ruleRow }`,
`validateScene(json) → { ok, errors[], warnings[] }`. The container (`driver.ts`)
applies `deals`/`shoe`/`setup` at step start via `queueForced` / `startShoe`.

### 5.2 Staged reveal and predictions

With `pauseAt`, the container plays the timeline up to that `pause-point` event and
stops. With `predict`, `PredictBar` shows the buttons and the answer key comes from
the already-resolved hand:

| kind | Buttons | Answer | Valid `pauseAt` |
|---|---|---|---|
| `player-draws` | Draw · Stand | `hand.playerRule.draws` | `two-cards` |
| `banker-draws` | Draw · Stand | `hand.bankerRule.draws` | `player-third` (or `two-cards` if every forced hand on the step has the Player standing or a natural) |
| `hand-total` | 0–9 keypad | the `side`'s total at the pause | `two-cards`, `player-third`, `all-cards` |
| `winner` | Player · Banker · Tie | `hand.winner` | `all-cards` |

Right: a tick and the reveal continues. Wrong: the hint, the rule row ("Banker 5
draws only when the Player's third card is 4–7"; the `TableauRuleId` and the
highlighted tableau cell) and the reveal continues; **no replay**. Either way a
`predicted` input is emitted. `completeWhen: {predicted: {correct: true, count: n}}`
counts correct answers since step start; Deal stays enabled until it completes.

### 5.3 Curriculum mapping (1:1)

The curriculum's requests map directly: `deals:[{player,banker}]` = `ForcedHand`;
`pauseAt` / `predict` / `{predicted:{correct,count}}` as above; `action{type}`,
`hands`, `handResult{winner, natural}`, `betOnFelt{bet,minAmount}`,
`previewed{bet}`, `tapped{target}` (bet ids, `commission`, `bead-plate`,
`big-road`, `shoe-tracker`), `acknowledged` + `advance: button`,
`autoPlayCompleted{minHands}`; scene `shoe: 'fresh' | {seed, startAtCard,
removed}`, `ui.shoeTracker`, `ui.roads`, `history`. Ids: bets, variants
(`punto-banco`, `ez`, `super-6`) and strategies are the curriculum's (§6.1).

### 5.4 `validateScene`: no dead ends (errors fail the build)

1. **Shape**: `version: 1`, unique step ids, known condition kinds, money integer
   cents on the `betUnit` grid and within limits, card codes parse.
2. **Forced hands**: each passes `validateForcedHand` (2–3 cards per side, third
   card exactly when the tableau draws, ≤ 8 copies of a code in one hand). The
   engine's reshuffle fallback (§1.6) makes availability a non-issue.
3. **Variant**: every bet in `allowedBets`, `bets`, `highlight`, `betOnFelt`,
   `previewed`, `tapped`, `whyOpen` and `expect` is offered by the scene's variant
   (`dragon-7`/`panda-8` need `variant: ez`; `tapped: commission` needs
   `punto-banco`).
4. **Deal lock** (playbook §9): a step whose `completeWhen` needs no dealt hand
   must not allow `deal`; a step that needs one (`hands`, `handResult`,
   `predicted`, `event` of a hand event, `action: deal`, `trackerPositive`) must
   allow `deal` (or `autoPlay` for `autoPlayCompleted`).
5. **Guaranteed results**: `handResult {winner/natural}` must be guaranteed by the
   step's forced hands (every forced hand on the step produces it), or the
   condition sits in an `any` with a `hands` fallback, or `onDealsExhausted` is
   `random` and the condition is reachable by chance only when wrapped in `any`
   (lint error otherwise). `minNet` needs forced hands and a fixed `expect` slip.
6. **Predictions**: `predicted` needs `predict` on the step; `kind`/`pauseAt` per
   §5.2; `correct: true` with `count > |deals|` needs `onDealsExhausted: random`.
7. **UI targets**: `tapped: bead-plate|big-road` needs that road in `ui.roads`;
   `shoe-tracker` / `trackerPositive` need `ui.shoeTracker: true`;
   `trackerPositive` also needs a `shoe` setup and is linted by **running** the
   scene's seed: the bet must turn positive within 2 shoes (else error).
8. **Bets placeable**: `betOnFelt`'s `minAmount` ≤ bankroll after presets and ≥ the
   bet's min; `set-bet` in `allowedActions`; the chips in `ui.chips` can make it.
9. **Previews**: `previewed`/`whyOpen` need `showEV` not false (practice allowed:
   the sheet opens after settle).
10. **Auto-play**: `autoPlayCompleted` needs `autoPlay.enabled`, the strategy in
    `strategies`, `minHands` ≤ max(`handOptions`). Runs end on bust too and still
    fire `autoPlayCompleted` (holdumb D32), so a bust never blocks.
11. **Acknowledged** needs `advance: button`.
12. **Script test** (integration): `lessons.test.ts` drives every scene to
    completion with a scripted learner (correct predictions, required bets, Deal),
    plus a "wrong answers first" pass for prediction steps.

### 5.5 Example (Banker third-card rule)

```yaml
id: l06-s2
version: 1
bankroll: 50000
ui: { roads: [bead-plate], speed: normal }
allowedActions: [deal]
steps:
  - id: banker-5
    text: The Banker has **5**. Watch the Player's third card, then call it.
    pauseAt: player-third
    predict: { kind: banker-draws }
    deals:
      - { player: [3h, 2c, 6d], banker: [Kd, 5s, 9c] }   # P 5 draws 6 → B 5 draws (4–7)
      - { player: [Ac, 4h, 2s], banker: [7d, 8c] }       # P 5 draws 2 → B 5 stands
    hint: Banker 5 draws only when the Player's third card is 4, 5, 6 or 7.
    completeWhen: { predicted: { correct: true, count: 2 } }
    advance: button
```

(The validator checks P 3+2 = 5 draws, B K+5 = 5 draws on a 6, the second hand's
B 7+8 = 5 stands on a 2; random hands follow if the learner misses.)

---

## 6. Strategies, auto-play, simulation, drill (`src/sim/strategy/`, `src/sim/jobs/`)

### 6.1 Presets (D9)

All presets bet on a `target` main bet (default Banker) in units; ties are pushes
for Player/Banker targets and **leave the progression where it is**. Bets are capped
at `min(tableMax, bankroll)`; a cap that breaks the system (Martingale, Labouchère)
counts a `capHits` and resets the progression.

| Id | Rule (u = unit) |
|---|---|
| `flat-banker` | u on Banker every hand (the lowest-edge lens) |
| `flat-player` | u on Player |
| `flat-tie` | u on Tie |
| `martingale` | start u; after a loss double; after a win back to u |
| `paroli` | start u; after a win double; after 3 wins in a row or any loss back to u |
| `one-three-two-six` | 1, 3, 2, 6 units on consecutive wins; a loss or a completed 6 resets |
| `fibonacci` | 1, 1, 2, 3, 5, 8 … units; a loss moves one step on, a win two steps back |
| `dalembert` | a loss +1 unit, a win −1 unit (min 1) |
| `labouchere` | list `sequence` (default [1, 2, 3, 4]); bet first + last; a win crosses both off, a loss appends the bet; an empty list restarts |
| `follow-the-shoe` | u on the last non-tie winner (Banker on the shoe's first hand) |
| `side-bet-sprinkler` | flat u on Banker + `sideBets` amounts each hand (default $5 Player Pair + $5 Banker Pair) |

Exact cost per hand for **flat** presets = u × edge (§2.5): $10 flat Banker loses
$0.1058/hand = **$7.62/hour**; flat Player $8.89/hour; flat Tie $103.39/hour. For
progressions the exact identity is: expected loss = Σ (bet × edge of that bet),
so a system's cost per hour = edge × its average total bet per hour, measured by
the simulation and shown next to the flat line ("Martingale bet an average $31.40
per hand, so it cost 1.06% of that: the same edge on more money"; the
figures come from the run, never typed).

```ts
// ===== src/sim/strategy/types.ts — FROZEN (payload of jobs/protocol.ts) =====
import type { BetId, Card, CardValue, Cents, HandResult, Slip, TableauRuleId, TiePays,
  VariantId, VisibleView, Winner } from '../engine/types';

export type StrategyLens = 'lowest-edge' | 'practical' | 'fun';
export type StrategyId =
  | 'flat-banker' | 'flat-player' | 'flat-tie'
  | 'martingale' | 'paroli' | 'one-three-two-six' | 'fibonacci' | 'dalembert' | 'labouchere'
  | 'follow-the-shoe' | 'side-bet-sprinkler';
export interface StrategySpec {
  id: StrategyId;
  unit: Cents;                        // e.g. 1_000
  target?: 'banker' | 'player';       // progressions; default 'banker'
  sideBets?: Partial<Record<BetId, Cents>>; // side-bet-sprinkler (and optional on any preset)
  sequence?: number[];                // labouchere
  label?: string;                     // compare-mode legend
}
export interface StrategyMemory { [k: string]: number | string | boolean | number[] }
export interface Strategy {
  id: StrategyId; name: string; lens: StrategyLens;
  init(spec: StrategySpec): StrategyMemory;
  /** Pure. The slip for the next hand (may be empty = sit out). */
  decide(view: VisibleView, mem: StrategyMemory, spec: StrategySpec): Slip;
  /** Pure. Update memory from the settled hand. */
  update(mem: StrategyMemory, spec: StrategySpec, result: HandResult): StrategyMemory;
}

export interface SimulateRequest {
  strategy: StrategySpec;
  compare?: StrategySpec[];           // same seeds → identical cards hand by hand
  variant: VariantId; tiePays: TiePays;
  hands: number;                      // per session, ≤ 20_000
  sessions: number;                   // 1 | 100 (≤ 1_000)
  seed: number;                       // session i uses seed + i
  bankroll: Cents;
  stopAtBust?: boolean;               // default true: bust = equity < the table minimum the system needs
  stopWin?: Cents; stopLoss?: Cents;
  handsPerHour: number;               // 72
}
export interface SessionSeries {
  strategy: StrategySpec;
  /** sessions = 1: equity after each hand ([0] = start). */
  equity?: Int32Array;
  /** sessions > 1: percentiles of equity per hand (busted sessions hold their final value). */
  p10?: Float64Array; p50?: Float64Array; p90?: Float64Array;
  /** Mean of Σ bet × full-shoe EV, per hand index (the "expected" line). */
  expected: Float64Array;
  survival?: Float64Array;            // share of sessions still playing after hand i
  finals: Int32Array;
  meanFinal: number; meanFinalCi95: number;
  bustRate: number; probAhead: number;
  handsPlayed: number;
  meanBetPerHand: number;             // cents
  costPerHourCents: number;           // edge-weighted, from the bets placed
  capHits: number;
  winners: Record<Winner, number>;
  sideBetHits: Partial<Record<BetId, number>>;
}
export interface SimulateResult { series: SessionSeries[]; ms: number }

// ---------- drill (D11: third-card-rule trainer) ----------
export type DrillMode = 'player' | 'banker' | 'winner' | 'payout' | 'mixed';
/** A tableau cell: 'p5' (player total), 'b4/p7' (banker total / player third), 'b6/s' (player stood), 'nat'. */
export type TableauCellId = string;
export interface DrillSpot {
  code: string;                       // 'b:3h2c6d.Kd5s' (mode letter, player cards, banker cards)
  mode: Exclude<DrillMode, 'mixed'>;
  player: readonly Card[];            // shown so far (2, or 3 for banker questions)
  banker: readonly Card[];            // 2 (3 shown only in winner mode)
  cell: TableauCellId;
  question: string;                   // 'Does the Banker draw?'
  options: readonly string[];         // ['Draw', 'Stand'] | ['Player', 'Banker', 'Tie'] | payout amounts
  /** payout mode only */
  payout?: { bet: BetId; amount: Cents; variant: VariantId; winner: Winner; bankerTotal: CardValue; bankerCards: 2 | 3 };
}
export interface DrillFilter { mode: DrillMode; focus?: TableauCellId[]; variant?: VariantId; hard?: boolean }
export interface DrillGrade {
  correct: boolean;
  answer: string; chosen: string;
  rule: TableauRuleId | null;          // null in payout mode
  cell: TableauCellId;
  explanation: string;                 // 'Banker 5 draws when the Player's third card is 4–7 (it was 6).'
}
```

`strategy/presets.ts` implements the table; `simulate.ts` exports
`simulateJob: Job<SimulateRequest, SimulateResult>`; `metrics.ts` the per-hour
figures; `drill.ts` `nextSpot(rng, filter)`, `gradeSpot(spot, chosen)`,
`spotCode`/`spotFromCode` (round trip).

### 6.2 `jobs/protocol.ts` (frozen; architecture §4.2, Plan A)

```ts
// ===== src/sim/jobs/protocol.ts — FROZEN =====
import type { SimulateRequest, SimulateResult } from '../strategy/types';
import type { Progress } from '../engine/job';
export type { Progress, Job } from '../engine/job';

export interface EvJobs {
  simulate: { req: SimulateRequest; res: SimulateResult }; // auto-play, many sessions, compare
}
export type JobKind = keyof EvJobs;
export interface EvClient {
  run<K extends JobKind>(
    kind: K, req: EvJobs[K]['req'],
    opts?: { key?: string; signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<EvJobs[K]['res']>;
  readonly mode: 'worker' | 'inthread';
  dispose(): void;
}
```

One job kind covers single sessions, many sessions and compare (architecture's
`simulateMany` folds into `sessions > 1`). Previews are not jobs.

### 6.3 Simulation (`simulate.ts`, pure generator)

The hand loop is `applyAction(state, {type:'deal'})` after setting the strategy's
slip, so settlement is the engine's. A real shoe per session (D8), seeded
`seed + i`. **Compare mode** reruns the same seeds: because the cards drawn never
depend on the bets (a deal always draws the same cards from the same state), every
strategy sees identical hands (asserted). Yield every 200 hands. Budget
(architecture §4.5): 1,000 hands < 1 s and 100 × 200 hands < 3 s at 4× throttle; a
Node benchmark test enforces 100 k hands < 4 s. The expected line uses full-shoe
EVs of the bets placed, labelled as such (§2.7).

### 6.4 Auto-play panel and charts

Inputs: strategy (grouped by lens), unit, target, side bets, hands (72 = 1 h, 720
= 10 h, 7,200 = 100 h, custom ≤ 20,000), sessions (1 / 100), seed, compare (up to
4). Output (hand-rolled SVG, holdumb's BankrollChart): one session: equity line vs
the dashed expected line; 100 sessions: **p10–p90 band + median + expected**, a
**survival curve** panel (share not busted), a final-equity histogram; a summary that
labels exact vs simulated (§2.7): edge × money bet per hour, mean bet, actual
(simulated) result, bust rate, P(ahead), cap hits. Compare: one colour + dash
pattern per strategy (never colour alone), legend with cost per hour. "Watch" plays
≤ 72 hands on the felt at fast speed with the roads filling.

### 6.5 Drill trainer (`drill.ts`)

Spots come from the engine (`playHand`, `playerDraws`, `bankerDraws`), never a
separate rule copy:
- `player`: deal 2 + 2, ask "Does the Player draw?" (naturals included: the
  answer is Stand, rule `natural`).
- `banker`: deal until the Player's decision is made (third card shown), ask
  "Does the Banker draw?".
- `winner`: the whole hand face up, "Who wins?".
- `payout`: a bet, amount, variant and result ("Banker wins with 6 in Super 6,
  $20 on Banker: what's paid?"), options = the right profit + 3 distractors from
  common mistakes (no commission, full 1:1, stake included).
- `hard: true` weights banker spots to the rows 3–6 with a Player third card (the
  cells people miss); `focus` restricts to missed cells (architecture's "Review
  misses"). Grading is strict: one right answer, and the explanation names the rule
  and the highlighted tableau cell. Spot codes are stable for deep links
  (`#/play?shoe=…`).

---

## 7. Test plan

Tooling as in architecture.md (Vitest node + dom, Testing Library, Playwright,
axe). Coverage target: engine + math ≥ 95% lines.

### 7.1 Engine
- **Tableau oracle** (`__tests__/oracle.ts`, written from §1.3's prose as nested
  if/else; does not import `tableau.ts`/`bets.ts`/`settle.ts`): **every** value
  sequence of P1 B1 P2 B2 (10⁴), with every P3 and B3 (≤ 10⁶ sequences), gives the
  same draws, totals, winner and rule as `playHand`; `bankerDraws` equals the
  literal `TABLEAU` on all 8 × 11 cells, and `TABLEAU` equals curriculum.md's chart.
- **Settlement oracle**: for every one of the 400 outcome cells × pair flags ×
  3 variants × 2 tie pays × every bet, `settle` equals the oracle's restated
  payout; golden settlements (§1.5) as named tests; commission rounding exact on
  the `betUnit` grid (§1.5).
- **Basis property test**: perturbing fields outside a bet's `basis` never changes
  its payout.
- **Shoe**: burn counts for each first-card rank (A → 1 … K → 10); the cut card
  fires once, exactly one extra hand follows, then `shoe-finished`; the next deal
  reshuffles; 16 cards always suffice (10 k shoes); `exposed` excludes face-down
  burns; `unseenRanks` totals = 416 − exposed; `ShoeSetup` removals and
  `startAtCard`; forced hands swap in, keep the composition, and fall back to a
  reshuffle when a code is exhausted.
- **Flow**: event order (§1.8) for natural / player-stands / both-draw hands;
  **money conservation** (equity before + net = equity after, every hand);
  `replay` reproduces state; deep-frozen inputs never mutated; validation codes,
  one test each.
- **RNG**: holdumb's golden sequence and χ² position-uniformity test over the shoe.
- **Roads**: bead plate and Big Road golden layouts (streaks, dragon tail, blocked
  tail, leading ties, multiple ties, pair dots); rebuild from history after replay.

### 7.2 Math
- **Pinned values** (§2.5): every fraction, hand probabilities, per-resolved edges.
- **Independent enumerator**: `__tests__/reference.ts` enumerates **card by card
  over rank counts** (13 ranks, recursion, no shared code with `distribution.ts`,
  bigint throughout) and must produce the same 400-cell histogram for the full shoe
  of 1, 6 and 8 decks and 50 random depleted compositions (sizes 6..416).
- **Engine ↔ math agreement** (one source of truth): for 30 random small
  compositions (N ≤ 12, so every ordering can be listed), deal **every** ordering
  through the engine (`playHand` + `settleHand` in cents) and compare the exact
  mean net per bet with `betEvs`.
- Number path vs bigint path: identical histograms on 200 compositions; the
  2^53 guard throws for N > 416.
- `previewSlip`: lines sum, per-hour = 72 × per hand, alternative picks Banker in
  punto-banco/EZ and Player in Super 6, `needsConfirm` = sucker bets; "Why?" rows sum
  exactly to the EV; tier boundaries.
- **Monte Carlo** (fixed seeds, CI): 2 M fresh-shoe hands per variant: every bet's
  mean within 4σ of the exact EV (the scratch run: all |z| < 1.6); 200 real shoes
  with forced-card-free play: mean Banker/Player within 4σ.
- **Perf** (Node): full-shoe distribution + EVs < 5 ms; 1,000 depleted
  compositions < 3 s.

### 7.3 Strategy, drill, scenes
- Every preset's `decide` returns a legal slip on 50 k random views; progression
  golden sequences (Martingale L L W → 1, 2, 4, 1; Paroli W W W → 1, 2, 4, 1;
  1-3-2-6; Fibonacci; D'Alembert; Labouchère crossing off); ties leave the state.
- Compare mode sees identical cards (assert per-hand winners equal across specs).
- Flat presets: simulated mean per hand within 4σ of u × edge over 200 k hands.
- Bust and cap handling; `autoPlayCompleted` fires on bust.
- Drill: `spotFromCode(spotCode(s)) = s`; every answer equals `playerDraws` /
  `bankerDraws` / `playHand`; payout answers equal `settle`; `hard` weighting share.
- Scenes: `validateScene` fixtures for each rule in §5.4 (one failing fixture per
  rule); runner for every `Condition`; **every lesson scene scripted to completion**.

### 7.4 Components (`*.test.tsx`, happy-dom)
EvSheet: every offered bet with edge and tier label, slip totals, alternative "Use
this", sucker second tap, "Why?" rows with counts. BetSpot: per-variant spots (EZ
shows Dragon 7 / Panda 8, others don't). HandView: third card sideways. Scoreboard:
bead plate / Big Road from fixtures. Layouts: every interactive rect ≥ `minTapUnits`,
no overlaps, inside the viewBox, in both orientations and all variants. Animation:
`instant` → empty timeline; reduced motion; pause points split the timeline.

### 7.5 E2E (Playwright: 390×844, 844×390, desktop)
1. Sandbox: tap $25 chip, Banker; the sheet shows −1.06% "Good bet" before Deal;
   deal with `?seed=` and a forced hand; bankroll changes by the golden amount
   ($23.75 on a Banker win).
2. Tie needs a second tap with `confirmCostlyBets`; the alternative card offers Banker.
3. Settings → EZ: Dragon 7 / Panda 8 spots appear; a forced 3-card-7 hand pushes Banker.
4. Roads fill after 10 hands; a shoe run to the cut card shows "Last hand" then a new shoe.
5. Shoe tracker on: values change after each hand; < 30 ms per update (perf spec).
6. Lesson scene with `pauseAt`/`predict` completes after correct answers; a wrong
   answer shows the rule row.
7. Auto-play: 100 sessions × 720 hands of Martingale vs flat Banker: band, survival
   curve, labels "exact" / "simulated".
8. Drill: answer a Player and a Banker spot; streak; "See the chart".
9. Every `[data-hit]` ≥ 44×44 in both orientations; no horizontal scroll at 360 px;
   Deal visible at 844×390; axe clean on sandbox, lesson, drill, auto-play.
10. Single file under `file://`: deal a hand and open the EV sheet.

---

## 8. Implementation chunks (file ownership)

The contract = `engine/types.ts` (§1.2) + `math/types.ts` (§2.2) +
`strategy/types.ts` (§6.1) + `scene/types.ts` (§5.1) + `jobs/protocol.ts` (§6.2),
copied verbatim by WP0 and frozen. WP0 also implements `cards.ts` (`parseCards`,
`cardValue`), `tableau.ts` (`handTotal`, `playerDraws`, `bankerDraws`, `TABLEAU`)
and the bet/variant id lists, because content validation needs them.

| Chunk (= architecture WP) | Owns | Depends on | Delivers |
|---|---|---|---|
| **A: engine** | `src/sim/engine/**` incl. `__tests__/oracle.ts` | WP0 | rng, shoe (burn, cut card, forced swap, setups), tableau `playHand`, bets registry, settle, validate, roads, game, log. **Push `bets.ts` + `settle.ts` first** (math needs `settle`). |
| **B: math** | `src/sim/math/**` incl. `__tests__/reference.ts` | A (bets registry early) | distribution (Number + bigint), betEvs, fullShoeEvs + PINNED, previewSlip, tiers, explain, tracker, MC + perf tests |
| **C: table-ui** | `src/sim/ui/**` except integration's and strategy's files | contract types; real engine + math for the gallery | layouts, felt, cards, spots, chips, ActionBar, EvSheet, WhyTable, TierBadge, AltCard, Scoreboard, ShoeTracker, Tableau, animation (pause points), text, screenshots |
| **D: strategy** | `src/sim/strategy/**`, `src/sim/jobs/**`, `ui/{AutoPlayPanel,BankrollChart,SurvivalChart,OutcomeHistogram}.tsx` | A, B | presets, simulate job, metrics, compare, drill.ts, charts, benchmark |
| **E: integration** | `src/sim/scene/**`, `ui/{Simulator,StepPanel,PredictBar,persist,settings}`, `tests/e2e/**` (except infra's) | all | scene runner + strict validateScene, container wiring engine + math + jobs + UI + scenes, staged reveal/predict, Shoe tracker toggle, persistence mid-shoe, every-scene-completes test, e2e + perf + axe |

Order: A starts; B, C, D start against the contract (B and D merge A's branch as
soon as the registry lands); E last. Roads stay in the engine (no new layer).

---

## 9. Notes for decisions.md

| # | Topic | Proposal |
|---|---|---|
| 1 | Variant ids | `punto-banco` / `ez` / `super-6` (curriculum's); architecture's `commission: 'classic'` → `variant: 'punto-banco'`; one `SimSettings.variant` field. |
| 2 | Bet ids | the curriculum's 9 ids (§1.2). |
| 3 | Strategy ids | the curriculum's 10 + `side-bet-sprinkler` (the fun-per-dollar side-bet lens). |
| 4 | Primary metric | house edge per bet placed (ties push); per resolved bet in "Why?". |
| 5 | Tiers | free / good ≤ 2% / fair ≤ 5% / costly < 9% / sucker ≥ 9%; sucker = second tap. |
| 6 | Commission | taken from the win at settlement; rounding rule (gross down, commission up) never fires on the $1 grid. |
| 7 | Worker | none (Plan A). EV sheet sync; tracker live after every hand. |
| 8 | Jobs | one `simulate` kind (sessions and compare inside), not `simulate` + `simulateMany`. |
| 9 | Empty-felt deal | allowed (no-money hand) for roads lessons and follow-the-shoe. |
| 10 | After the cut card | one more hand (D8's "reshuffle after the shoe"). |
| 11 | Auto-play hands | options 72 / 720 / 7,200 (1, 10, 100 hours at D5's 72/h). |

Assumptions (no user input needed): single seat (other players' cards are just
more dealt cards; they're in the shoe's exposed set the same way); side bets may be
bet alone; Tie in EZ/Super 6 follows `tiePays`; bankroll can't go negative (a bet
you can't afford is rejected). Chips for `docs/chips.md`: derived roads drawn
live, Super 6 / Perfect Pair / Big-Small side bets, a commission-box mode, a
counting-strategy auto-play preset that bets EZ side bets only when the tracker is
positive (its honest result at casino bet limits), squeeze (declined in D7).

---

## Appendix A: Scratch evidence

`/tmp/baccaratton-scratch/simulator/`:
- `oracle.py`: exact Python enumerator (value classes, recursive, fractions);
  `python3 oracle.py 8` prints every §2.5 value in 0.2 s.
- `rows.py`: Dragon Bonus rows, SDs, $/hour, pinned probabilities.
- `bench.mjs`: Number vs bigint histogram, exact vs float EVs, depleted shoes,
  2 M-hand Monte Carlo (all |z| < 1.6).
- `shoe.mjs`: 500 real shoes with the burn and cut-card rules and a live exact
  recompute after every hand (81.0 hands per shoe, p99 3.05 ms).
- `road.py`: the Big Road algorithm of §3.3 and its fixtures.
- `tc/`: the five frozen type blocks extracted from this doc; `tsc --strict
  --noUnusedLocals` passes.
