// Shared test helpers for the engine's own tests (not exported from the barrel).
import { parseCards } from './cards';
import { playHand } from './tableau';
import { VARIANT_IDS } from './types';
import type { CardValue, HandRecord, TableRules, TableauOutcome, TiePays } from './types';
import { VARIANT_RULES } from './rules';

/** Plays a hand from explicit side cards ('Ah 2d [5c]'); throws if the tableau disagrees. */
export function handOf(player: string, banker: string): HandRecord {
  const p = parseCards(player);
  const b = parseCards(banker);
  const order = [p[0]!, b[0]!, p[1]!, b[1]!, ...p.slice(2), ...b.slice(2)];
  let i = 0;
  const h = playHand(() => {
    const c = order[i++];
    if (c === undefined)
      throw new Error(`handOf: the tableau wants more cards (${player} / ${banker})`);
    return c;
  });
  if (i !== order.length || h.player.cards.length !== p.length)
    throw new Error(`handOf: the tableau does not draw these cards (${player} / ${banker})`);
  return { ...h, n: 1, shoeNo: 1, handInShoe: 1, forced: true };
}

/** Every one of the 400 outcome cells times the 4 pair-flag combinations. */
export function allOutcomes(): TableauOutcome[] {
  const out: TableauOutcome[] = [];
  for (let pt = 0; pt < 10; pt++)
    for (let bt = 0; bt < 10; bt++)
      for (const pc of [2, 3] as const)
        for (const bc of [2, 3] as const)
          for (const pp of [false, true])
            for (const bp of [false, true])
              out.push({
                playerTotal: pt as CardValue,
                bankerTotal: bt as CardValue,
                playerCards: pc,
                bankerCards: bc,
                playerPair: pp,
                bankerPair: bp,
              });
  return out;
}

/** 3 variants x 2 tie payouts. */
export function allRules(): TableRules[] {
  return VARIANT_IDS.flatMap((v) =>
    ([8, 9] as TiePays[]).map((tiePays) => ({ ...VARIANT_RULES[v], tiePays })),
  );
}
