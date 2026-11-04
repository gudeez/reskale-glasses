// From the Reskale app: first written 2026-05-16, last changed 2026-10-04 (before this repo). See HACKATHON.md.
/**
 * Two-tier TTL cache for /api/ebay/search (Browse API) responses.
 *
 * Same shape as lib/sold-cache.ts (L1 = in-memory Map per Vercel instance,
 * L2 = Upstash Redis, fail-open on any Redis hiccup), but with:
 *   - a distinct Redis key prefix so entries don't collide with sold cache
 *   - a distinct L1 store so entries don't evict each other under MAX_ENTRIES
 *   - a shorter default TTL because active-listing data shifts faster than
 *     sold-listing data, but still long enough to serve as an eBay quota shield
 *
 * The two caches deliberately don't share code — sold-cache is production
 * hot-path, and adding a `prefix` parameter to it risks a subtle regression.
 * Duplication is the safer, cheaper trade.
 */

import { getRedis, withTimeout } from './upstash';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  insertedAt: number;
}

interface RedisEnvelope<T> {
  value: T;
  expiresAt: number;
  insertedAt: number;
}

// Default 6h — enough that a popular product hit by 100 users in 6h costs one
// real call. The env override may shorten it but never lengthen it past the
// licence's six-hour freshness limit (see MAX_STALE_MS).
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = Math.min(
  parseInt(process.env.EBAY_BROWSE_CACHE_TTL_MS ?? String(SIX_HOURS_MS), 10) || SIX_HOURS_MS,
  SIX_HOURS_MS,
);
// 5 min for empty responses so a transient failure doesn't freeze the UI at
// "no results" for a day. Next request retries the (now-hopefully-healthy) API.
const EMPTY_TTL_MS = 5 * 60 * 1000;

/**
 * The oldest entry the stale rescue may serve. eBay API License Agreement
 * §8.1(a)(3): displayed item listing data may not be more than six hours old.
 * Past this, an outage shows "try again" instead of an out-of-licence answer.
 */
export const MAX_STALE_MS = SIX_HOURS_MS;

const store = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 1000;
const REDIS_KEY_PREFIX = 'browse:';

/**
 * Build a cache key that includes every request parameter that meaningfully
 * changes the response. Order-normalized so identical requests hit the same
 * entry regardless of param order on the wire.
 */
export function makeKey(params: {
  query: string;
  condition?: string | null;
  gtin?: string | null;
  categoryIds?: string | null;
  itemIds?: string[];
}): string {
  const query = params.query.toLowerCase().trim();
  const condition = (params.condition ?? '').toLowerCase();
  const gtin = params.gtin ?? '';
  const categoryIds = (params.categoryIds ?? '').split(',').filter(Boolean).sort().join(',');
  const itemIds = (params.itemIds ?? []).slice().sort().join(',');
  return `${query}|${condition}|${gtin}|${categoryIds}|${itemIds}`;
}

function l1Get<T>(key: string): CacheEntry<T> | null {
  return (store.get(key) as CacheEntry<T> | undefined) ?? null;
}

function l1Set<T>(key: string, entry: CacheEntry<T>): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, entry);
}

// Fresh-only read: L1 → L2 → null. On L2 hit, promotes to L1.
export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();

  const l1 = l1Get<T>(key);
  if (l1 && l1.expiresAt > now) return l1.value;

  const redis = getRedis();
  if (!redis) return null;

  const env = await withTimeout<RedisEnvelope<T> | null>(
    redis.get<RedisEnvelope<T>>(REDIS_KEY_PREFIX + key),
    'browse.cacheGet',
  );
  if (!env) return null;
  if (env.expiresAt <= now) return null;

  l1Set(key, { value: env.value, expiresAt: env.expiresAt, insertedAt: env.insertedAt });
  return env.value;
}

// Stale-allowed read: returns ANY entry (fresh or expired). Caller decides
// whether to use it. Used as the last-resort rescue when the Browse API
// fails or we're near daily quota.
export async function cacheGetStale<T>(
  key: string,
  maxStaleMs = MAX_STALE_MS,
): Promise<{ value: T; ageMs: number } | null> {
  const now = Date.now();

  const l1 = l1Get<T>(key);
  if (l1) {
    const ageMs = Math.max(0, now - l1.insertedAt);
    return ageMs <= maxStaleMs ? { value: l1.value, ageMs } : null;
  }

  const redis = getRedis();
  if (!redis) return null;

  const env = await withTimeout<RedisEnvelope<T> | null>(
    redis.get<RedisEnvelope<T>>(REDIS_KEY_PREFIX + key),
    'browse.cacheGetStale',
  );
  if (!env) return null;

  const ageMs = Math.max(0, now - env.insertedAt);
  if (ageMs > maxStaleMs) return null;

  l1Set(key, { value: env.value, expiresAt: env.expiresAt, insertedAt: env.insertedAt });
  return { value: env.value, ageMs };
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry<T> = { value, expiresAt: now + ttlMs, insertedAt: now };

  l1Set(key, entry);

  const redis = getRedis();
  if (!redis) return;

  const envelope: RedisEnvelope<T> = {
    value,
    expiresAt: entry.expiresAt,
    insertedAt: entry.insertedAt,
  };

  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000) + 5);
  await withTimeout(
    redis.set(REDIS_KEY_PREFIX + key, envelope, { ex: ttlSec }),
    'browse.cacheSet',
  );
}

/**
 * Pick the right TTL based on how "useful" the response is. Full-length TTL
 * for real results, short TTL for empties so failures self-heal fast.
 */
export function ttlForPayload(payload: {
  items?: unknown[];
  totalResults?: number;
}): number {
  const hasItems = Array.isArray(payload.items) && payload.items.length > 0;
  const hasResults = (payload.totalResults ?? 0) > 0;
  if (hasItems || hasResults) return DEFAULT_TTL_MS;
  return EMPTY_TTL_MS;
}
