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
  mainMin: Cents; mainMax: Cents;  // player, banker: 500 .. 500_000 (D16: $5–$5,000)
  sideMin: Cents; sideMax: Cents;  // tie and side bets: 100 .. 50_000 (D16: $1–$500)
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
/** Rich or poor shoes for lessons: cards removed as if already dealt (they count as seen).
 * D36: may leave as few as 6 unseen cards; with `removed`, the burn (face-up and face-down) is drawn from the removed set. */
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
