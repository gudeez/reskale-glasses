// Pre-existing (Reskale), trimmed for this repo: eBay sold rows and live counts from ScrapeBadger. Server only.
/**
 * eBay sold prices and the live listing count from ScrapeBadger, ported from
 * the Reskale web app (src/lib/sold-comps/scrapebadger-ebay.ts and helpers).
 *
 * GET /v1/ebay/completed (sold) and /v1/ebay/search (live), 8 credits each,
 * header `x-api-key`. Row fields per ScrapeBadger's OpenAPI: `item_id`,
 * `title`, `url`, `image`, `price{value,currency}`, `shipping_cost{value}`,
 * `free_shipping`, `condition`, `buying_format` ("Buy It Now" | "Auction" |
 * "Best Offer"), `sold_date_at` (YYYY-MM-DD, or null). `pagination.total_results`
 * is eBay's own match count, sometimes sent as a string.
 *
 * A Best Offer row's price is the ASK — eBay hides what was accepted — so it
 * is flagged `bestOfferAccepted` and left out of the typical price.
 */

import { z } from 'zod';
import type { SoldAnswer, SoldComp, SoldResult } from './sold';

const API_BASE = 'https://scrapebadger.com';
/** Enough sales for a stable median; ScrapeBadger pages hold 60, 120 or 240. */
const PER_PAGE = '60';
/** A lone read took ~5s live; a seller is waiting. */
const TIMEOUT_MS = 12_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** US eBay, US sellers. */
const SEARCH = { domain: 'com', per_page: PER_PAGE, location: 'domestic' } as const;

export type ScrapeBadgerErrorKind = 'auth' | 'quota' | 'rate_limited' | 'upstream' | 'bad_response';

export class ScrapeBadgerError extends Error {
  constructor(
    readonly kind: ScrapeBadgerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ScrapeBadgerError';
  }
}

function errorFor(status: number): ScrapeBadgerError {
  if (status === 401 || status === 403) return new ScrapeBadgerError('auth', `ScrapeBadger rejected the API key (${status})`);
  if (status === 402) return new ScrapeBadgerError('quota', 'ScrapeBadger credits used up (402)');
  if (status === 429) return new ScrapeBadgerError('rate_limited', 'ScrapeBadger rate limit hit (429)');
  return new ScrapeBadgerError('upstream', `ScrapeBadger answered ${status}`);
}

/** One plain ScrapeBadger GET → its JSON body, failing in a classified way. */
async function scrapeBadgerGet(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ScrapeBadgerError('upstream', `ScrapeBadger unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw errorFor(res.status);
  const body = await res.json().catch(() => null);
  if (body == null) throw new ScrapeBadgerError('bad_response', `ScrapeBadger ${path} answer wasn't JSON`);
  return body;
}

/** A whole, non-negative count from a number or a string like "1,234"; null otherwise. */
export function toCount(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  const digits = v.replace(/[,\s+]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** A positive price rounded to the cent; null otherwise. */
export function toPrice(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** An https link on the marketplace's own site, or null — never a link elsewhere. */
function marketplaceUrl(raw: string, domain: string): string | null {
  try {
    const u = new URL(raw);
    const onSite = u.hostname === domain || u.hostname.endsWith(`.${domain}`);
    return u.protocol === 'https:' && onSite ? u.toString() : null;
  } catch {
    return null;
  }
}

/** An https URL as given, or null. */
function httpsOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

const money = z.object({ value: z.union([z.number(), z.string()]).nullish(), currency: z.string().nullish() }).nullish();

const row = z.object({
  item_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string(),
  image: z.string().nullish(),
  price: money,
  currency: z.string().nullish(),
  shipping_cost: money,
  free_shipping: z.boolean().nullish(),
  condition: z.string().nullish(),
  buying_format: z.string().nullish(),
  sold_date_at: z.string().nullish(),
});

const page = z.object({
  results: z.array(z.unknown()),
  pagination: z.object({ total_results: z.union([z.number(), z.string()]).nullish() }).nullish(),
});

/** What was paid for shipping: the stated cost, 0 when it shipped free, null when eBay didn't say. */
function shippingOf(r: z.infer<typeof row>): number | null {
  const stated = r.shipping_cost?.value;
  if (stated != null) {
    const n = typeof stated === 'number' ? stated : parseFloat(stated);
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  }
  return r.free_shipping === true ? 0 : null;
}

/** One raw row → SoldComp, or null when it can't be used honestly. */
export function toScrapeBadgerSoldComp(raw: unknown): SoldComp | null {
  const parsed = row.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const soldPrice = toPrice(r.price?.value);
  const url = marketplaceUrl(r.url, 'ebay.com');
  const currency = r.price?.currency || r.currency || 'USD';
  if (soldPrice == null || url == null || currency !== 'USD') return null;

  return {
    itemId: r.item_id,
    title: r.title,
    url,
    imageUrl: httpsOrNull(r.image),
    soldPrice,
    shippingPrice: shippingOf(r),
    currency,
    soldDate: r.sold_date_at && ISO_DAY.test(r.sold_date_at) ? r.sold_date_at : null,
    condition: r.condition || null,
    bestOfferAccepted: r.buying_format === 'Best Offer',
  };
}

/** A ScrapeBadger page → its rows and eBay's total, or null when it isn't one. */
export function readPage(body: unknown): { results: unknown[]; total: number | null } | null {
  const parsed = page.safeParse(body);
  if (!parsed.success) return null;
  const total = parsed.data.pagination?.total_results;
  return { results: parsed.data.results, total: toCount(total ?? null) };
}

/** A completed-listings page → usable sold rows and eBay's count of every matching sale. */
export function parseSoldPage(body: unknown): { comps: SoldComp[]; soldTotal: number | null } {
  const read = readPage(body);
  if (!read) throw new ScrapeBadgerError('bad_response', 'ScrapeBadger eBay sold answer had no results array');
  return {
    comps: read.results.map(toScrapeBadgerSoldComp).filter((c): c is SoldComp => c !== null),
    soldTotal: read.total,
  };
}

/** Recent eBay US sales for `query`, plus eBay's count of all matching sales. */
export async function fetchScrapeBadgerEbaySold(
  query: string,
  apiKey: string,
): Promise<{ comps: SoldComp[]; soldTotal: number | null }> {
  return parseSoldPage(await scrapeBadgerGet('/v1/ebay/completed', { query, ...SEARCH }, apiKey));
}

/** How many eBay US listings match `query` right now — sell-through's other side. */
export async function fetchScrapeBadgerEbayActiveTotal(query: string, apiKey: string): Promise<number | null> {
  const read = readPage(await scrapeBadgerGet('/v1/ebay/search', { query, ...SEARCH }, apiKey));
  if (!read) throw new ScrapeBadgerError('bad_response', 'ScrapeBadger eBay listings answer had no results array');
  return read.total;
}

/** Fewer usable sales than this and there is no typical price. */
export const MIN_SALES_FOR_SUMMARY = 3;

/** Linear-interpolated percentile of an ascending array (p in 0..1). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * The typical sold price: median and middle-half range (25th–75th percentile)
 * over the sales whose price is what was paid. Best Offer rows are counted but
 * left out of the prices — their price is the seller's ask.
 */
export function summarizeSold(comps: readonly SoldComp[]): SoldResult['summary'] {
  const prices = comps
    .filter((c) => !c.bestOfferAccepted)
    .map((c) => c.soldPrice)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (prices.length < MIN_SALES_FOR_SUMMARY) return null;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    count: prices.length,
    median: round(percentile(prices, 0.5)),
    low: round(percentile(prices, 0.25)),
    high: round(percentile(prices, 0.75)),
    bestOfferCount: comps.filter((c) => c.bestOfferAccepted).length,
  };
}

/** The sold rows and both counts → the answer /api/sold sends. */
export function buildSoldAnswer(
  sold: { comps: SoldComp[]; soldTotal: number | null },
  activeTotal: number | null,
  fetchedAt: string,
): SoldAnswer {
  return {
    comps: sold.comps,
    summary: summarizeSold(sold.comps),
    soldTotal: sold.soldTotal,
    activeTotal,
    relevance: null,
    rowKind: 'sale',
    fetchedAt,
  };
}
