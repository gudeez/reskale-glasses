// Hackathon (Nov 4 2026): a small in-memory limit per caller address, per minute, for the API routes.
// This app has no accounts, so the caller is its address. Server only.

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export const TOO_MANY = 'Too many searches at once. Wait a minute and try again.';

/** The caller's address: the first hop a proxy names, else this machine. */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'local';
}

/** True, and counted, when this caller has made fewer than `limit` `bucket` requests in the last minute. */
export function allowRequest(bucket: string, request: Request, limit: number, now = Date.now()): boolean {
  const key = `${bucket}|${callerKey(request)}`;
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  hits.set(key, [...recent, now]);
  return true;
}

/** The 429 for a caller over the limit; `extra` keeps the body in the shape the client reads. */
export function tooManyResponse(extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: TOO_MANY, ...extra }, { status: 429, headers: { 'Retry-After': '60' } });
}
