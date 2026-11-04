// From the Reskale app: first written 2026-10-29, last changed 2026-10-29 (before this repo). See HACKATHON.md.
/**
 * Barcode → product name, from UPCitemdb's free "trial" endpoint (no key).
 *
 * The scan used to name an item after the first eBay listing carrying that
 * GTIN, or the bare digits when none did. A product database gives a clean
 * name to search eBay with instead. Server-side only; the route caches by
 * barcode because the free tier is small (100 lookups a day per address).
 */

const ENDPOINT = 'https://api.upcitemdb.com/prod/trial/lookup';
const TIMEOUT_MS = 6_000;
const BARCODE_LENGTHS = new Set([8, 12, 13, 14]);

export interface UpcProduct {
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  imageUrl: string | null;
}

export type UpcLookupResult =
  | { status: 'found'; product: UpcProduct }
  | { status: 'not_found' }
  /** The free daily limit is spent — try again later, don't cache as "unknown". */
  | { status: 'busy' }
  | { status: 'unavailable' };

/** Digits only, and only a length a retail barcode can be (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d+$/.test(digits) && BARCODE_LENGTHS.has(digits.length) ? digits : null;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function toProduct(item: unknown): UpcProduct | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const title = text(row.title);
  if (!title) return null;
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    title,
    brand: text(row.brand),
    model: text(row.model),
    category: text(row.category),
    imageUrl: images.map(text).find((url): url is string => !!url) ?? null,
  };
}

export async function lookupUpc(barcode: string): Promise<UpcLookupResult> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?upc=${encodeURIComponent(barcode)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[upc] lookup failed:', err instanceof Error ? err.message : err);
    return { status: 'unavailable' };
  }

  if (res.status === 429) return { status: 'busy' };

  let body: { code?: string; items?: unknown[] } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (body?.code === 'EXCEED_LIMIT') return { status: 'busy' };
  if (body?.code === 'INVALID_UPC') return { status: 'not_found' };
  if (!res.ok || !body) return { status: 'unavailable' };

  for (const item of body.items ?? []) {
    const product = toProduct(item);
    if (product) return { status: 'found', product };
  }
  return { status: 'not_found' };
}
