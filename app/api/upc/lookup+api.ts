// Pre-existing (Reskale), trimmed for this repo: no accounts, an in-memory limit per caller.
/**
 * GET /api/upc/lookup?code=<barcode> — a scanned barcode's product name.
 *
 * Limited per caller: the free UPC database behind it allows about 100
 * lookups a day, shared by everyone on this server's address, so a barcode is
 * looked up once and then served from the cache.
 */

import { allowRequest, tooManyResponse } from '@/lib/rate-limit';
import { cacheGet, cacheSet } from '@/lib/browse-cache';
import { lookupUpc, normalizeBarcode, type UpcProduct } from '@/lib/upc-lookup';

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUND_TTL_MS = 30 * DAY_MS;
// A barcode the database doesn't know may be added later; ask again tomorrow.
const NOT_FOUND_TTL_MS = DAY_MS;
const PER_MINUTE = 30;

type Cached = { product: UpcProduct | null };

const cacheKey = (barcode: string) => `upc|${barcode}`;

export async function GET(request: Request): Promise<Response> {
  const barcode = normalizeBarcode(new URL(request.url).searchParams.get('code') ?? '');
  if (!barcode) {
    return Response.json({ error: 'That doesn’t look like a product barcode.' }, { status: 400 });
  }

  const cached = await cacheGet<Cached>(cacheKey(barcode));
  if (cached) return Response.json({ product: cached.product, cached: true });

  if (!allowRequest('upc', request, PER_MINUTE)) return tooManyResponse({ product: null });

  const result = await lookupUpc(barcode);
  switch (result.status) {
    case 'found':
      await cacheSet<Cached>(cacheKey(barcode), { product: result.product }, FOUND_TTL_MS);
      return Response.json({ product: result.product });
    case 'not_found':
      await cacheSet<Cached>(cacheKey(barcode), { product: null }, NOT_FOUND_TTL_MS);
      return Response.json({ product: null });
    case 'busy':
      return Response.json({ error: 'The barcode database is busy right now.', product: null }, { status: 503 });
    default:
      return Response.json({ error: 'The barcode database is unavailable right now.', product: null }, { status: 503 });
  }
}
