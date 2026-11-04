// Pre-existing (Reskale), trimmed for this repo: no accounts, an in-memory limit per caller.
/**
 * GET /api/ebay/category?q=video games → { category: { categoryId, categoryName } | null }
 *
 * "Reskale, search in video games category only": the eBay category the
 * seller named, for /api/ebay/search's `categoryIds`. eBay's Taxonomy API
 * suggests categories for the words; lib/ebay-category-match.ts picks the
 * one named. Taxonomy has its own daily quota, not Browse's, and categories
 * barely change, so an answer is kept a week.
 */

import { getEbayAppToken, isEbayConfigured } from '@/lib/ebay-auth';
import { cacheGet, cacheSet } from '@/lib/browse-cache';
import { allowRequest, tooManyResponse } from '@/lib/rate-limit';
import { bestCategory, type CategorySuggestion, type EbayCategory } from '@/lib/ebay-category-match';

const TAXONOMY_BASE = 'https://api.ebay.com/commerce/taxonomy/v1';
/** EBAY_US's category tree. */
const EBAY_US_TREE_ID = '0';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PER_MINUTE = 60;
const FAILED = 'Couldn’t reach eBay to look up that category. Try again in a moment.';

type Payload = { category: EbayCategory | null };

export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  if (q.length < 2) return Response.json({ error: 'Say which category to search.' }, { status: 400 });
  if (!isEbayConfigured()) return Response.json({ error: FAILED }, { status: 503 });

  const cacheKey = `taxonomy:${q}`;
  const cached = await cacheGet<Payload>(cacheKey);
  if (cached) return Response.json(cached);

  if (!allowRequest('ebay-category', request, PER_MINUTE)) return tooManyResponse();

  try {
    const token = await getEbayAppToken();
    const res = await fetch(
      `${TAXONOMY_BASE}/category_tree/${EBAY_US_TREE_ID}/get_category_suggestions?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      console.error(`[ebay/category] suggestions failed: ${res.status}`);
      return Response.json({ error: FAILED }, { status: 502 });
    }
    const data = (await res.json()) as { categorySuggestions?: CategorySuggestion[] };
    const payload: Payload = { category: bestCategory(q, data.categorySuggestions ?? []) };
    await cacheSet(cacheKey, payload, WEEK_MS);
    return Response.json(payload);
  } catch (err) {
    console.error('[ebay/category] lookup failed:', err);
    return Response.json({ error: FAILED }, { status: 502 });
  }
}
