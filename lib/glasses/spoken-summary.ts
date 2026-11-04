/**
 * What a glasses scan found, read aloud in two parts. The figures are the
 * ones the Scan tab's result sheet shows (its listings, and the sold and
 * sell-through cards). Pure — no native imports.
 *
 *   Part A, as soon as the item is named:
 *     "Stanley 25 foot FatMax tape measure. Looks used."
 *   Part B, when the sold data is back:
 *     "312 listed, 190 sold in 90 days. Used sell for about 18 dollars, new
 *      about 27. Sell-through 61 percent."
 *
 * A number that isn't known is left out, never said as zero. Sell-through is
 * sold in about 90 days ÷ listed now (lib/sold-comps/sell-through.ts), and
 * only with an exact listed count: eBay's licence forbids working it out from
 * the Browse search's total, which is said only as a count of listings.
 */

import type { EbaySearchResult } from '@/lib/ebay';
import { soldByCondition } from '@/lib/sold-comps/condition-split';
import type { SoldAnswer } from '@/lib/sold-comps/sold';
import type { Question } from './voice-commands';

/** Said as soon as the item is named, before its prices are back. */
export interface GlassesIdentity {
  title: string;
  /** The condition read from the photo; null when it wasn't (or on a barcode). */
  condition: string | null;
}

/** One scan as it is read aloud: what it is, and what the result sheet shows for it. */
export interface GlassesScanResult extends GlassesIdentity {
  /** The listings on the sheet; empty when the search failed. */
  ebay: EbaySearchResult;
  /** Recent eBay sales; null when the lookup failed or hasn't answered. */
  sold: SoldAnswer | null;
  /** Exact count of eBay listings now, fit for sell-through; null when not known. */
  listedNow: number | null;
  /** Why there is no sold data, when there isn't. */
  soldError: 'out_of_lookups' | 'failed' | null;
}

/** How a scan ended, as far as the glasses need to say it. */
export type GlassesScanOutcome =
  | { kind: 'found'; result: GlassesScanResult }
  /** Nothing was identified — nothing priced. */
  | { kind: 'not_found' }
  /** Out of scans; the phone shows the way through. */
  | { kind: 'quota' }
  | { kind: 'failed' }
  /** The seller cancelled. `scanUsed`: the photo had already been identified, so the scan counted. */
  | { kind: 'cancelled'; scanUsed: boolean };

export interface MarketSummary {
  /** Listings on eBay now; null when unknown. */
  listedCount: number | null;
  /** Sold in about the last 90 days; null when unknown. */
  soldCount: number | null;
  /** Typical sold price, new and used apart; null when too few sales. */
  newPrice: number | null;
  usedPrice: number | null;
  /** The one price to quote when there is no split, in dollars; null when unknown. */
  price: number | null;
  /** 'sold' = recent sold prices; 'asking' = what current listings ask. */
  priceKind: 'sold' | 'asking' | null;
  /** Whole percent; null without both exact counts. Can pass 100. */
  sellThroughPct: number | null;
}

const NOT_FOUND = "Couldn't find that one. Try the brand tag or the barcode.";
const OUT_OF_SCANS = "You're out of scans. Check your phone.";
const FAILED = "That didn't work. Check your phone.";
const NO_PRICES = 'No prices found yet.';
const OUT_OF_LOOKUPS = "You're out of sold-price lookups this month.";
const SOLD_FAILED = "Couldn't get sold prices right now.";
const CANCELLED = 'Cancelled.';
const CANCELLED_USED = 'Cancelled. That scan was already used.';
const NOTHING_YET = 'Scan something first.';
const DONT_KNOW = "I don't have that one.";
const NOT_ENOUGH = (band: string) => `Not enough ${band} sales to say.`;

/** Enough to name the item exactly ("Lego Star Wars 75192 Millennium Falcon Ultimate Collector Series"). */
const MAX_TITLE_WORDS = 12;

/**
 * sold ÷ listed, as lib/sold-comps/sell-through.ts sellThroughRate (not
 * imported: that file brings the network client with it). Null when nothing
 * is listed.
 */
function sellThroughRate(sold: number, listed: number): number | null {
  return sold >= 0 && listed > 0 ? sold / listed : null;
}

function positive(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

type MarketInput = Pick<GlassesScanResult, 'ebay' | 'sold' | 'listedNow'>;

export function marketSummary({ ebay, sold, listedNow }: MarketInput): MarketSummary {
  const split = sold ? soldByCondition(sold.comps) : { newPrice: null, usedPrice: null };
  const soldMedian = positive(sold?.summary?.median);
  const asking = positive(ebay.avgPriceUsed) ?? positive(ebay.avgPriceNew);
  const soldCount = sold?.soldTotal ?? null;
  const rate = soldCount != null && listedNow != null ? sellThroughRate(soldCount, listedNow) : null;
  return {
    listedCount: listedNow ?? sold?.activeTotal ?? (ebay.totalResults > 0 ? ebay.totalResults : null),
    soldCount,
    newPrice: split.newPrice,
    usedPrice: split.usedPrice,
    price: soldMedian ?? asking,
    priceKind: soldMedian !== null ? 'sold' : asking !== null ? 'asking' : null,
    sellThroughPct: rate === null ? null : Math.round(rate * 100),
  };
}

/**
 * An item title fit to be read aloud: no links, no symbols, at most a few
 * words. "Nike #Tech & Fleece | Hoodie L/XL" → "Nike Tech and Fleece Hoodie L XL".
 */
export function spokenTitle(title: string): string {
  const words = title
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/&/g, ' and ')
    .replace(/’/g, "'")
    // Keep a decimal point between digits ("2.0"); every other symbol becomes a gap.
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
    .replace(/[^\p{L}\p{N}'\u0000\s]/gu, ' ')
    .replace(/\u0000/g, '.')
    .split(/\s+/)
    .filter((w) => w && w !== "'");
  return words.slice(0, MAX_TITLE_WORDS).join(' ');
}

function dollars(price: number): string {
  const n = Math.max(1, Math.round(price));
  return `${n} ${n === 1 ? 'dollar' : 'dollars'}`;
}

const counted = new Intl.NumberFormat('en-US');

/** "Looks used", from the vision route's New / Like New / Used / For Parts. */
function conditionWords(condition: string): string {
  const c = condition.trim().toLowerCase();
  if (/part/.test(c)) return 'Looks like it is for parts.';
  return `Looks ${c}.`;
}

/** Part A: what it is, and the condition when the photo showed it. */
export function identitySentence({ title, condition }: GlassesIdentity): string {
  const name = spokenTitle(title);
  return [name ? `${name}.` : '', condition ? conditionWords(condition) : ''].filter(Boolean).join(' ');
}

function countsSentence(m: MarketSummary): string | null {
  const listed = m.listedCount != null ? `${counted.format(m.listedCount)} listed` : null;
  const sold = m.soldCount != null ? `${counted.format(m.soldCount)} sold in 90 days` : null;
  const both = [listed, sold].filter(Boolean).join(', ');
  return both ? `${both}.` : null;
}

function priceSentence(m: MarketSummary): string | null {
  if (m.usedPrice !== null && m.newPrice !== null) {
    return `Used sell for about ${dollars(m.usedPrice)}, new about ${dollars(m.newPrice)}.`;
  }
  if (m.usedPrice !== null) return `Used sell for about ${dollars(m.usedPrice)}.`;
  if (m.newPrice !== null) return `New sell for about ${dollars(m.newPrice)}.`;
  if (m.price === null) return null;
  return `${m.priceKind === 'sold' ? 'Sells for' : 'Listed for'} about ${dollars(m.price)}.`;
}

function rateSentence(m: MarketSummary): string | null {
  if (m.sellThroughPct === null) return null;
  // A few sales against many listings rounds to 0; it isn't none.
  return m.sellThroughPct === 0 ? 'Sell-through under 1 percent.' : `Sell-through ${m.sellThroughPct} percent.`;
}

/** Part B: counts, prices and sell-through — each only when known. */
export function marketSentence(result: MarketInput & Pick<GlassesScanResult, 'soldError'>): string {
  const m = marketSummary(result);
  const parts = [countsSentence(m), priceSentence(m), rateSentence(m)].filter((p): p is string => p !== null);
  if (result.soldError === 'out_of_lookups') parts.push(OUT_OF_LOOKUPS);
  else if (result.soldError === 'failed') parts.push(SOLD_FAILED);
  if (parts.length === 0) parts.push(NO_PRICES);
  return parts.join(' ');
}

/** Everything about a scan in one go: what Hold repeats. */
export function spokenSummary(outcome: GlassesScanOutcome): string {
  switch (outcome.kind) {
    case 'found':
      return [identitySentence(outcome.result), marketSentence(outcome.result)].filter(Boolean).join(' ');
    case 'not_found':
      return NOT_FOUND;
    case 'quota':
      return OUT_OF_SCANS;
    case 'failed':
      return FAILED;
    case 'cancelled':
      return outcome.scanUsed ? CANCELLED_USED : CANCELLED;
  }
}

/**
 * "Reskale, what does it sell for new?" — answered from the last result,
 * never a new lookup. An unknown number is said to be unknown, never 0.
 */
export function answerQuestion(question: Question, result: GlassesScanResult | null): string {
  if (!result) return NOTHING_YET;
  const m = marketSummary(result);
  switch (question) {
    case 'identity':
      return identitySentence(result) || DONT_KNOW;
    case 'price':
      return priceSentence(m) ?? DONT_KNOW;
    case 'new_price':
      return m.newPrice !== null ? `New sell for about ${dollars(m.newPrice)}.` : NOT_ENOUGH('new');
    case 'used_price':
      return m.usedPrice !== null ? `Used sell for about ${dollars(m.usedPrice)}.` : NOT_ENOUGH('used');
    case 'sold_count':
      return m.soldCount !== null ? `${counted.format(m.soldCount)} sold in 90 days.` : DONT_KNOW;
    case 'listed_count':
      return m.listedCount !== null ? `${counted.format(m.listedCount)} listed now.` : DONT_KNOW;
    case 'sell_through':
      return rateSentence(m) ?? DONT_KNOW;
  }
}
