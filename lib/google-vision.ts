// Pre-existing (Reskale), trimmed for this repo: the client half of "identify
// this photo". The server half (app/api/vision+api.ts) is new for the
// hackathon and runs on Muse.

import { API_BASE_URL } from '@/lib/api-config';

export interface VisionResult {
  brand: string;
  model: string;
  category: string;
  condition: string;
  /** True when `condition` was read from the photo, not the 'Used' fallback. */
  conditionSeen?: boolean;
  bestGuessLabel: string;
  searchQuery: string;
  webEntities: { description: string; score: number }[];
  matchingPages: string[];
  suggestedQueries: string[];
  /** Hackathon: a price tag or sticker Muse read in the photo, in US dollars; null when none. */
  priceTagUsd?: number | null;
  /** Hackathon: how sure Muse was, 0–1. */
  confidence?: number;
  /** Hackathon: which Muse model gave this answer. */
  identifiedBy?: string;
}

const IDENTIFY_FAILED = 'Couldn’t identify that. Try again with the item in the middle of the frame.';
/** Spark, then Wonder if Spark isn't sure: room for both. */
const TIMEOUT_MS = 50_000;

/**
 * Identify an item from one or more photos (base64 JPEG, no data: prefix) of
 * the SAME object. Up to 4 are used. `hint` is a product name already known
 * from its barcode.
 */
export async function analyzeImage(images: string[], hint?: string): Promise<VisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: images.slice(0, 4), hint }),
      signal: controller.signal,
    });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as (VisionResult & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error || IDENTIFY_FAILED);
  return body;
}
