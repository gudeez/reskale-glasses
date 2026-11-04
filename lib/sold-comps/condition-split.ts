// From the Reskale app: first written 2026-11-02, last changed 2026-11-02 (before this repo). See HACKATHON.md.
import type { CheckedSale } from './sold';

/**
 * What an item sold for, new and used apart. Pure.
 *
 * The condition words are reskale-web's (src/lib/arbitrage/comp-filter.ts,
 * classifyCondition), so the phone and Deal Radar file a sale in the same
 * band. eBay's label varies by category, so text that matches nothing is
 * "unknown", never a guess, and an unknown sale counts in neither price.
 * Rows from eBay's sales research carry no condition at all.
 */

export type ConditionBand = 'new' | 'used' | 'other' | 'unknown';

/** Refurbished and for-parts first: "Seller refurbished" would otherwise read as used. */
const OTHER_PATTERN = /refurb|for parts|not working|parts only/i;
const NEW_PATTERN = /^\s*(brand )?new\b|\bnew with\b|\bnew without\b|\bnew \(other\)|\bopen(ed)? box\b/i;
const USED_PATTERN = /\bpre-?owned\b|\bused\b|\bvery good\b|\bgood\b|\bacceptable\b/i;

export function classifyCondition(raw: string | null | undefined): ConditionBand {
  if (!raw || !raw.trim()) return 'unknown';
  if (OTHER_PATTERN.test(raw)) return 'other';
  if (NEW_PATTERN.test(raw)) return 'new';
  if (USED_PATTERN.test(raw)) return 'used';
  return 'unknown';
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Fewer sales than this in a band and its price isn't said: two sales aren't a market. */
export const MIN_SALES_PER_BAND = 3;

export interface SoldByCondition {
  /** Typical sold price, new; null when too few new sales. */
  newPrice: number | null;
  usedPrice: number | null;
  newCount: number;
  usedCount: number;
}

/**
 * Typical sold price per band, over the sales that are the item. A sale the
 * server judged an accessory or a different item is left out, as it is left
 * out of the typical price on the card.
 */
export function soldByCondition(sales: readonly CheckedSale[]): SoldByCondition {
  const prices: Record<'new' | 'used', number[]> = { new: [], used: [] };
  for (const sale of sales) {
    if (sale.relevance === 'accessory' || sale.relevance === 'different') continue;
    const band = classifyCondition(sale.condition);
    if (band === 'new' || band === 'used') prices[band].push(sale.soldPrice);
  }
  const typical = (list: number[]) => (list.length >= MIN_SALES_PER_BAND ? median(list) : null);
  return {
    newPrice: typical(prices.new),
    usedPrice: typical(prices.used),
    newCount: prices.new.length,
    usedCount: prices.used.length,
  };
}
