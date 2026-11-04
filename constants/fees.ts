// From the Reskale app: first written 2026-03-01, last changed 2026-11-04 (before this repo). See HACKATHON.md.
export const EBAY_FINAL_VALUE_FEE = 0.135; // 13.5%
export const DEFAULT_PROMOTED_PCT = 0.03;  // 3% default promoted listing fee
export const DEFAULT_BIN_RATE = 1.67;      // Goodwill Bins, $ per lb

/**
 * A scan's free-form condition ("Used - good", "New with tags") as the bucket
 * minListPrice takes. Anything not new-ish is used: the safer 3x target.
 */
export function listingCondition(condition: string | null | undefined): 'used' | 'new' {
  const c = (condition ?? '').toLowerCase();
  return c.includes('new') && !c.includes('open') ? 'new' : 'used';
}

/**
 * Minimum listing price to hit the target profit multiplier after eBay fees.
 * Used goods: target = 3x buy price
 * New goods:  target = 2x buy price
 */
export function minListPrice(
  buyPrice: number,
  condition: 'used' | 'new',
  promotedPct: number = DEFAULT_PROMOTED_PCT,
  fvfPct: number = EBAY_FINAL_VALUE_FEE
): number {
  const multiplier = condition === 'used' ? 3 : 2;
  const grossTarget = buyPrice * multiplier;
  // listPrice × (1 - FVF - promotedPct) >= grossTarget
  return grossTarget / (1 - fvfPct - promotedPct);
}

/**
 * Net profit after eBay fees and buy cost.
 */
export function netProfit(
  listPrice: number,
  buyPrice: number,
  promotedPct: number = DEFAULT_PROMOTED_PCT,
  fvfPct: number = EBAY_FINAL_VALUE_FEE
): number {
  return listPrice * (1 - fvfPct - promotedPct) - buyPrice;
}

/**
 * Effective payout after eBay fees (no buy cost deducted).
 */
export function ebayPayout(
  listPrice: number,
  promotedPct: number = DEFAULT_PROMOTED_PCT,
  fvfPct: number = EBAY_FINAL_VALUE_FEE
): number {
  return listPrice * (1 - fvfPct - promotedPct);
}
