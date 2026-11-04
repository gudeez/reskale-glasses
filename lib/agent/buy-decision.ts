// Hackathon (Nov 4 2026): the buy/pass sourcing agent's rules.
//
// The rules decide, here in code, so every verdict traces back to two numbers.
// Muse only puts the verdict into words (app/api/ask+api.ts), and is never
// allowed to change it.

import { DEFAULT_PROMOTED_PCT, EBAY_FINAL_VALUE_FEE } from '@/constants/fees';

/** Buy only if what you keep after eBay fees is at least this many times what you pay. */
export const RETURN_MULTIPLE = 3;
/** ...and more than this share of listings sold in eBay's ~90-day sold window. */
export const MIN_SELL_THROUGH = 0.3;
/** What eBay keeps of a sale: the final value fee plus the default promoted-listing fee. */
export const FEE_SHARE = EBAY_FINAL_VALUE_FEE + DEFAULT_PROMOTED_PCT;

export interface BuyInputs {
  /** What the store wants for it. */
  buyPrice: number | null;
  /** Typical 90-day sold price (median, Best Offer sales left out). */
  avgSoldPrice: number | null;
  /** Sold in eBay's ~90-day window. */
  soldCount: number | null;
  /** Listed on eBay now. */
  listedNow: number | null;
}

export type BuyVerdict = 'BUY' | 'PASS' | 'NEED_PRICE' | 'NOT_ENOUGH_DATA';

export interface BuyDecision {
  verdict: BuyVerdict;
  buyPrice: number | null;
  avgSoldPrice: number | null;
  /** What the seller keeps of a typical sale after eBay fees. */
  netAfterFees: number | null;
  /** netAfterFees ÷ buyPrice. */
  multiple: number | null;
  /** soldCount ÷ listedNow, 0–1+. */
  sellThrough: number | null;
  /** The most to pay and still make RETURN_MULTIPLE. */
  maxBuyPrice: number | null;
  /** Each rule: true passed, false failed, null not known. */
  money: boolean | null;
  speed: boolean | null;
}

const cents = (n: number) => Math.round(n * 100);
const usable = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

export function decide({ buyPrice, avgSoldPrice, soldCount, listedNow }: BuyInputs): BuyDecision {
  const price = usable(buyPrice) ? buyPrice : null;
  const sold = usable(avgSoldPrice) ? avgSoldPrice : null;
  const netAfterFees = sold !== null ? cents(sold * (1 - FEE_SHARE)) / 100 : null;
  const maxBuyPrice = netAfterFees !== null ? Math.floor((netAfterFees / RETURN_MULTIPLE) * 100) / 100 : null;
  const multiple = netAfterFees !== null && price !== null ? netAfterFees / price : null;
  // A count of 0 listed can't give a rate; that is unknown, not "sells instantly".
  const sellThrough =
    soldCount !== null && soldCount >= 0 && listedNow !== null && listedNow > 0 ? soldCount / listedNow : null;

  // Whole cents, so float noise can't flip a verdict at exactly 3x.
  const money = netAfterFees !== null && price !== null ? cents(netAfterFees) >= cents(price * RETURN_MULTIPLE) : null;
  const speed = sellThrough !== null ? sellThrough > MIN_SELL_THROUGH : null;

  const verdict: BuyVerdict =
    money === false || speed === false
      ? 'PASS'
      : sold === null || speed === null
        ? 'NOT_ENOUGH_DATA'
        : price === null
          ? 'NEED_PRICE'
          : 'BUY';

  return { verdict, buyPrice: price, avgSoldPrice: sold, netAfterFees, multiple, sellThrough, maxBuyPrice, money, speed };
}
