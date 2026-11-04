import { Redis } from '@upstash/redis';

let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  cached = url && token ? new Redis({ url, token }) : null;
  return cached;
}

const REDIS_OP_TIMEOUT_MS = 1_000;

export async function withTimeout<T>(p: Promise<T>, label: string): Promise<T | null> {
  try {
    const result = await Promise.race<T | null>([
      p,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout`)), REDIS_OP_TIMEOUT_MS),
      ),
    ]);
    return result;
  } catch (err: any) {
    console.warn(`[upstash] ${label} failed:`, err?.message ?? err);
    return null;
  }
}
