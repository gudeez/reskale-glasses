/**
 * Client for /api/upc/lookup — a scanned barcode's product name. A lookup that
 * fails is "no name", never an error: the scan carries on with eBay alone.
 */

import { API_BASE_URL } from '@/lib/api-config';
import { authFetch } from '@/lib/auth-fetch';

export interface UpcProduct {
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  imageUrl: string | null;
}

const TIMEOUT_MS = 8_000;

export async function lookupBarcodeProduct(barcode: string): Promise<UpcProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authFetch(`${API_BASE_URL}/api/upc/lookup?code=${encodeURIComponent(barcode)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.product?.title ? (data.product as UpcProduct) : null;
  } catch (err) {
    if (__DEV__) console.warn('[upc] lookup failed:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
