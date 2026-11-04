// From the Reskale app: first written 2026-03-01, last changed 2026-11-04 (before this repo). See HACKATHON.md.
/**
 * eBay API client — all calls go through Expo API Routes (server-side).
 * This file contains the client-side fetch wrappers.
 * The actual eBay tokens/secrets live only in the API routes.
 */

import { API_BASE_URL } from '@/lib/api-config';
import { authFetch } from '@/lib/auth-fetch';
import type { EbayCategory } from '@/lib/ebay-category-match';

export type { EbayCategory };

export interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  imageUrl: string;
  itemUrl: string;
  seller: string;
  soldDate?: string;
  /**
   * eBay authenticates the item before delivery. Set only when eBay said so —
   * absent means eBay didn't say, never "not guaranteed" (lib/ebay-authenticity.ts).
   */
  authenticityGuarantee?: boolean;
}

export interface EbaySearchResult {
  items: EbayListing[];
  avgPriceUsed: number | null;
  avgPriceNew: number | null;
  totalResults: number;
}

export interface SellThroughResult {
  activeListed: number;
  soldLast90: number;
  sellThroughRate: number; // 0–1
  // True only when we have real SOLD data. When false, the UI shows the
  // active-market snapshot instead of a misleading 0% STR.
  soldDataAvailable?: boolean;
  // Active-listing snapshot from the Browse API (count + asking-price stats).
  // Always present when Browse succeeds; the fallback shown when no sold data.
  activeMarket?: {
    count: number;
    avgPrice: number | null;
    medianPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
  } | null;
  // Set when all live sources failed and we served a previous cached response.
  stale?: boolean;
  staleAgeMs?: number;
  terapeak?: {
    sellThroughRate: number;
    totalSold: number;
    avgSoldPrice: number | null;
    soldPriceMin: number | null;
    soldPriceMax: number | null;
    avgShipping: number | null;
    freeShippingPct: number | null;
    totalSellers: number | null;
    trendDirection: string | null;
  } | null;
  soldScraper?: {
    sellThroughRate: number;
    soldCount: number;
    activeListed: number;
    avgPrice: number | null;
    medianPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    totalResults: number;
  } | null;
  source: string;
}

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

/**
 * Sends the sign-in token when there is a session (authFetch), so a signed-in
 * seller's lookups spend their own account's eBay limit rather than the small
 * budget shared by builds that send none (ENG-221). Signed out, it sends no
 * header, exactly as before.
 */
function fetchWithTimeout(url: string, ms = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return authFetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Tells /api/ebay/search this build draws the Authenticity Guarantee chip, so
 * the listings come back checked for it (app/api/ebay/search+api.ts).
 */
const SEARCH_SOURCE = 'search';

export async function searchEbay(
  query: string,
  condition?: string,
  matchingPages?: string[],
  categoryIds?: string | null,
): Promise<EbaySearchResult> {
  const params = new URLSearchParams({ query, source: SEARCH_SOURCE });
  if (condition) params.set('condition', condition);
  if (matchingPages && matchingPages.length > 0) {
    params.set('matchingPages', matchingPages.join(','));
  }
  if (categoryIds) params.set('categoryIds', categoryIds);

  const res = await fetchWithTimeout(`${API_BASE_URL}/api/ebay/search?${params}`);
  const data = await res.json();
  if (!res.ok) {
    console.warn('[ebay] search error:', data.error);
  }
  return data;
}

export async function searchEbayByBarcode(
  barcode: string,
  condition?: string,
): Promise<EbaySearchResult> {
  const params = new URLSearchParams({ query: barcode, gtin: barcode, source: SEARCH_SOURCE });
  if (condition) params.set('condition', condition);
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/ebay/search?${params}`);
  const data = await res.json();
  if (!res.ok) console.warn('[ebay] barcode search error:', data.error);
  return data;
}

/**
 * A search inside eBay categories — words, or a barcode as `gtin`. Games uses
 * Video Games. Null `categoryIds` searches every category (a sealed card
 * pack's barcode). Throws on a failed search, so it never reads as no results.
 */
export async function searchEbayInCategory(args: {
  query: string;
  categoryIds: string | null;
  gtin?: string | null;
}): Promise<EbaySearchResult> {
  const params = new URLSearchParams({ query: args.query, source: SEARCH_SOURCE });
  if (args.categoryIds) params.set('categoryIds', args.categoryIds);
  if (args.gtin) params.set('gtin', args.gtin);
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/ebay/search?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'eBay search failed');
  return data;
}

/**
 * The eBay category a seller named ("video games"), or null when eBay has
 * none by that name. Throws, in plain English, when eBay can't be reached.
 */
export async function findEbayCategory(name: string): Promise<EbayCategory | null> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/ebay/category?${new URLSearchParams({ q: name })}`, 15_000);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Couldn’t reach eBay to look up that category. Try again in a moment.');
  }
  return data.category ?? null;
}

export async function getSellThrough(query: string, condition?: string, skipTerapeak = false): Promise<SellThroughResult> {
  const params = new URLSearchParams({ query });
  if (condition) params.set('condition', condition);
  if (skipTerapeak) params.set('skipTerapeak', '1');
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/ebay/sold?${params}`);
  const data = await res.json();
  if (!res.ok) {
    console.warn('[ebay] sell-through error:', data.error);
  }
  return data;
}

export async function getPriceHistory(
  query: string,
  days = 90
): Promise<PriceHistoryPoint[]> {
  const params = new URLSearchParams({ query, days: String(days) });
  const res = await fetch(`${API_BASE_URL}/api/ebay/history?${params}`);
  if (!res.ok) throw new Error('Price history fetch failed');
  const data = await res.json();
  return data.dataPoints;
}

