// Pre-existing (Reskale), trimmed for this repo: no accounts, quota ledger, affiliate links or guarantee lookup.
import { getEbayAppToken, isEbayConfigured } from '@/lib/ebay-auth';
import { cacheGet, cacheGetStale, cacheSet, makeKey, ttlForPayload } from '@/lib/browse-cache';
import { allowRequest, tooManyResponse } from '@/lib/rate-limit';

const EBAY_BROWSE_API = 'https://api.ebay.com/buy/browse/v1';
const EBAY_SANDBOX_API = 'https://api.sandbox.ebay.com/buy/browse/v1';
/** Most visual matches one search looks up with getItem (one call each). */
const MAX_VISUAL_MATCHES = 10;
const PER_MINUTE = 30;

// Extract eBay item IDs from URLs like ebay.com/itm/123456789
function extractEbayItemIds(urls: string[]): string[] {
  const ids: string[] = [];
  for (const url of urls) {
    // Match patterns: /itm/123, /itm/title/123, /p/123
    const match = url.match(/ebay\.com\/itm\/(?:[^/]+\/)?(\d{9,15})/);
    if (match) {
      ids.push(match[1]);
    }
  }
  return [...new Set(ids)]; // dedupe
}

interface BrowseItem {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  imageUrl: string | null;
  itemUrl: string | null;
  seller: string | null;
  visualMatch?: boolean;
}

interface SearchPayload {
  items: BrowseItem[];
  avgPriceUsed: number | null;
  avgPriceNew: number | null;
  totalResults: number;
}

const EMPTY: SearchPayload = { items: [], avgPriceUsed: null, avgPriceNew: null, totalResults: 0 };

function ebayHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
  };
}

// Fetch specific items by ID from Browse API.
async function fetchItemsByIds(
  itemIds: string[],
  token: string,
  isSandbox: boolean,
): Promise<BrowseItem[]> {
  const base = isSandbox ? EBAY_SANDBOX_API : EBAY_BROWSE_API;

  // Fetch up to 10 visual matches in parallel
  const fetches = itemIds.slice(0, MAX_VISUAL_MATCHES).map(async (id): Promise<BrowseItem | null> => {
    try {
      const res = await fetch(`${base}/item/v1|${id}|0`, { headers: ebayHeaders(token) });
      if (!res.ok) return null;
      const item = await res.json();
      return {
        itemId: item.itemId,
        title: item.title,
        price: parseFloat(item.price?.value ?? '0'),
        currency: item.price?.currency ?? 'USD',
        condition: item.condition ?? 'Unknown',
        imageUrl: item.image?.imageUrl ?? null,
        itemUrl: item.itemWebUrl ?? null,
        seller: item.seller?.username ?? null,
        visualMatch: true,
      };
    } catch {
      return null;
    }
  });

  const results = await Promise.all(fetches);
  return results.filter((r): r is BrowseItem => r !== null);
}

interface KeywordSearchArgs {
  query: string;
  condition: string | null;
  gtin: string | null;
  categoryIds: string | null;
  token: string;
  isSandbox: boolean;
}

const CONDITION_FILTERS: Record<string, string> = {
  used: 'conditionIds:{3000|4000|5000|6000}',
  new: 'conditionIds:{1000|1500}',
  open_box: 'conditionIds:{1500|2500}',
  for_parts: 'conditionIds:{7000}',
};

/** The Browse search a query asks for. */
function keywordSearchParams(args: KeywordSearchArgs, limit = 20): URLSearchParams {
  const { query, condition, gtin, categoryIds } = args;
  const filters: string[] = [];
  if (gtin) filters.push(`gtin:{${gtin}}`);
  if (condition && CONDITION_FILTERS[condition]) filters.push(CONDITION_FILTERS[condition]);
  const params: Record<string, string> = {
    q: query || '*',
    limit: String(limit),
    sort: 'bestMatch',
  };
  if (filters.length > 0) params.filter = filters.join(',');
  if (categoryIds) params.category_ids = categoryIds;
  return new URLSearchParams(params);
}

async function fetchKeywordSearch(
  args: KeywordSearchArgs,
): Promise<{ items: BrowseItem[]; totalResults: number; ok: boolean }> {
  const base = args.isSandbox ? EBAY_SANDBOX_API : EBAY_BROWSE_API;

  const res = await fetch(`${base}/item_summary/search?${keywordSearchParams(args)}`, {
    headers: ebayHeaders(args.token),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.warn(`[ebay/search] API error (${res.status}):`, errBody);
    return { items: [], totalResults: 0, ok: false };
  }

  const data = await res.json();
  const totalResults: number = data.total ?? 0;
  const items: BrowseItem[] = (data.itemSummaries ?? []).map((item: any) => ({
    itemId: item.itemId,
    title: item.title,
    price: parseFloat(item.price?.value ?? '0'),
    currency: item.price?.currency ?? 'USD',
    condition: item.condition ?? 'Unknown',
    imageUrl: item.image?.imageUrl ?? null,
    itemUrl: item.itemWebUrl ?? null,
    seller: item.seller?.username ?? null,
  }));
  return { items, totalResults, ok: true };
}

function buildPayload(
  visualItems: BrowseItem[],
  keywordItems: BrowseItem[],
  keywordTotalResults: number,
): SearchPayload {
  // Merge: visual matches first, then keyword results (deduped).
  const visualMatchIds = new Set(visualItems.map((i) => i.itemId));
  const dedupedKeyword = keywordItems.filter((i) => !visualMatchIds.has(i.itemId));
  const items = [...visualItems, ...dedupedKeyword];

  const usedPrices = items
    .filter((i) => ['Used', 'Pre-Owned', 'Refurbished'].includes(i.condition))
    .map((i) => i.price);
  const newPrices = items
    .filter((i) => i.condition === 'New')
    .map((i) => i.price);

  const avg = (arr: number[]): number | null =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    items,
    avgPriceUsed: avg(usedPrices),
    avgPriceNew: avg(newPrices),
    totalResults: keywordTotalResults + visualItems.length,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('query') ?? '';
  const condition = url.searchParams.get('condition'); // 'used' | 'new' | 'open_box' | 'for_parts'
  const matchingPages = url.searchParams.get('matchingPages') ?? '';
  const gtin = url.searchParams.get('gtin'); // UPC/EAN barcode
  // Optional eBay category filter ("Reskale, search in video games only").
  const categoryIds = url.searchParams.get('categoryIds');

  if (!query && !gtin) {
    return Response.json({ error: 'Say or type what the item is first.' }, { status: 400 });
  }

  if (!isEbayConfigured()) {
    return Response.json({ ...EMPTY, error: 'eBay prices aren’t set up on this server.' }, { status: 503 });
  }

  // Parse matching page URLs and extract eBay item IDs up front so the cache
  // key covers them — otherwise two requests with different visual-match sets
  // would share a cache entry.
  const pageUrls = matchingPages ? matchingPages.split(',').filter(Boolean) : [];
  const ebayItemIds = extractEbayItemIds(pageUrls);

  const cacheKey = makeKey({ query, condition, gtin, categoryIds, itemIds: ebayItemIds });

  // Fresh cache hit: the same search in the last 6h returns without touching eBay.
  const cached = await cacheGet<SearchPayload>(cacheKey);
  if (cached) {
    return Response.json({ ...cached, cached: true });
  }

  if (!allowRequest('ebay-search', request, PER_MINUTE)) {
    const stale = await cacheGetStale<SearchPayload>(cacheKey);
    if (stale) {
      return Response.json({ ...stale.value, stale: true, staleAgeMs: stale.ageMs, reason: 'rate-limit' });
    }
    return tooManyResponse({ ...EMPTY });
  }

  try {
    const token = await getEbayAppToken();
    const isSandbox = process.env.EBAY_SANDBOX === 'true';

    // Run visual match lookups and the keyword search in parallel.
    const searchArgs: KeywordSearchArgs = { query, condition, gtin, categoryIds, token, isSandbox };
    const [visualItems, keywordRes] = await Promise.all([
      ebayItemIds.length > 0
        ? fetchItemsByIds(ebayItemIds, token, isSandbox)
        : Promise.resolve([] as BrowseItem[]),
      fetchKeywordSearch(searchArgs),
    ]);

    console.log(
      `[ebay/search] query="${query}" total=${keywordRes.totalResults} items=${keywordRes.items.length}`,
    );

    const payload = buildPayload(visualItems, keywordRes.items, keywordRes.totalResults);

    // If the API errored AND we have stale cache, prefer the stale-real over
    // the empty payload. Fresh empty is still cached below (short TTL) so we
    // don't hammer a broken source.
    if (!keywordRes.ok && visualItems.length === 0) {
      const stale = await cacheGetStale<SearchPayload>(cacheKey);
      if (stale) {
        console.warn(`[ebay/search] API error and no visual matches — serving stale (ageMs=${stale.ageMs})`);
        return Response.json({ ...stale.value, stale: true, staleAgeMs: stale.ageMs, reason: 'api-error' });
      }
    }

    // Cache with TTL scaled to result quality — real results get the full
    // window; empty responses get the short EMPTY_TTL so a transient failure
    // doesn't freeze results for hours.
    await cacheSet(cacheKey, payload, ttlForPayload(payload));

    return Response.json(payload);
  } catch (err: any) {
    console.warn('[ebay/search] exception:', err?.message ?? err);
    // Last-resort rescue — if we have any stale entry, serve it before an
    // empty payload. Better a day-old answer than "no data" on the client.
    const stale = await cacheGetStale<SearchPayload>(cacheKey);
    if (stale) {
      return Response.json({ ...stale.value, stale: true, staleAgeMs: stale.ageMs, reason: 'exception' });
    }
    return Response.json(EMPTY);
  }
}
