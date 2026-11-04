// Hackathon (Nov 4 2026): GET /api/sold?query= — eBay sold prices and sell-through for the buy/pass rules.
/**
 * Two ScrapeBadger reads in parallel (8 credits each): the sold rows with
 * eBay's count of every matching sale (about 90 days), and eBay's count of
 * listings matching now. Answers lib/sold-comps/sold.ts's `SoldAnswer`.
 *
 * Kept 6 hours per query, and a second ask for the same words while one is
 * on its way joins it, so a scan is billed once.
 */

import { allowRequest, tooManyResponse } from '@/lib/rate-limit';
import type { SoldAnswer } from '@/lib/sold-comps/sold';
import {
  buildSoldAnswer,
  fetchScrapeBadgerEbayActiveTotal,
  fetchScrapeBadgerEbaySold,
  ScrapeBadgerError,
} from '@/lib/sold-comps/scrapebadger-ebay';

const CACHE_MS = 6 * 60 * 60 * 1000;
const PER_MINUTE = 20;
const MIN_QUERY = 2;
const MAX_QUERY = 120;

const cache = new Map<string, { at: number; answer: SoldAnswer }>();
const inFlight = new Map<string, Promise<SoldAnswer>>();

const normalise = (query: string) => query.trim().toLowerCase().replace(/\s+/g, ' ');

async function lookUp(query: string, apiKey: string): Promise<SoldAnswer> {
  const [sold, active] = await Promise.allSettled([
    fetchScrapeBadgerEbaySold(query, apiKey),
    fetchScrapeBadgerEbayActiveTotal(query, apiKey),
  ]);
  if (sold.status === 'rejected') throw sold.reason;
  if (active.status === 'rejected') {
    console.warn('[sold] listed count failed:', active.reason instanceof Error ? active.reason.message : active.reason);
  }
  return buildSoldAnswer(sold.value, active.status === 'fulfilled' ? active.value : null, new Date().toISOString());
}

function failureMessage(err: unknown): string {
  if (err instanceof ScrapeBadgerError && err.kind === 'quota') {
    return 'Sold prices are used up for now. Asking prices still work.';
  }
  if (err instanceof ScrapeBadgerError && err.kind === 'rate_limited') {
    return 'Sold prices are busy. Try again in a minute.';
  }
  return 'Couldn’t get eBay sold prices right now. Try again in a moment.';
}

export async function GET(request: Request): Promise<Response> {
  const query = (new URL(request.url).searchParams.get('query') ?? '').trim();
  if (query.length < MIN_QUERY || query.length > MAX_QUERY) {
    return Response.json({ error: 'Say or type what the item is first.' }, { status: 400 });
  }

  const apiKey = process.env.SCRAPEBADGER_API_KEY;
  if (!apiKey) return Response.json({ error: 'Sold prices aren’t set up on this server.' }, { status: 503 });

  const key = normalise(query);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json(hit.answer);

  let pending = inFlight.get(key);
  if (!pending) {
    if (!allowRequest('sold', request, PER_MINUTE)) return tooManyResponse();
    pending = lookUp(query, apiKey);
    inFlight.set(key, pending);
  }

  try {
    const answer = await pending;
    cache.set(key, { at: Date.now(), answer });
    return Response.json(answer);
  } catch (err) {
    console.warn('[sold] lookup failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: failureMessage(err) }, { status: 502 });
  } finally {
    inFlight.delete(key);
  }
}
