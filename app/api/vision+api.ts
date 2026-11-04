// Hackathon (Nov 4 2026): identify an item from the glasses' photo with Muse.
//
// Spark answers first, because the seller is standing there holding the item.
// Only when Spark isn't sure (confidence under 0.5, or no search words) is the
// same question put to Wonder, the smarter and dearer model.

import { museChat, MuseError } from '@/lib/muse/client';
import { identifyMessages, IDENTITY_SCHEMA, needsEscalation, parseIdentity, toVisionResult, type MuseIdentity } from '@/lib/muse/identify';
import { MUSE_FAST, MUSE_SMART, type MuseModel } from '@/lib/muse/models';

const MAX_IMAGES = 4;
/** About 6 MB of JPEG per photo, far above what the glasses send. */
const MAX_IMAGE_CHARS = 8_000_000;
const NOT_IDENTIFIED = 'Couldn’t identify that. Try again with the item in the middle of the frame.';

async function identifyWith(model: MuseModel, images: string[], hint: string | null): Promise<MuseIdentity | null> {
  const reply = await museChat({ model, messages: identifyMessages(images, hint), json: IDENTITY_SCHEMA, timeoutMs: 22_000 });
  return parseIdentity(reply.text);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { images?: unknown; hint?: unknown } | null;
  const images = Array.isArray(body?.images)
    ? body.images.filter((i): i is string => typeof i === 'string' && i.length > 0 && i.length <= MAX_IMAGE_CHARS).slice(0, MAX_IMAGES)
    : [];
  if (images.length === 0) return Response.json({ error: 'No photo came through. Take it again.' }, { status: 400 });
  const hint = typeof body?.hint === 'string' ? body.hint : null;

  let fast: MuseIdentity | null = null;
  let fastError: unknown = null;
  try {
    fast = await identifyWith(MUSE_FAST, images, hint);
  } catch (err) {
    fastError = err;
  }
  if (!needsEscalation(fast)) return Response.json(toVisionResult(fast!, MUSE_FAST));

  // Spark wasn't sure, or failed: one more try on Wonder. A budget refusal
  // would only refuse again, so it is reported as it is.
  if (fastError instanceof MuseError && /budget/i.test(fastError.message)) {
    return Response.json({ error: fastError.message }, { status: 402 });
  }
  try {
    const smart = await identifyWith(MUSE_SMART, images, hint);
    if (smart && smart.searchQuery) return Response.json(toVisionResult(smart, MUSE_SMART));
  } catch (err) {
    console.warn('[vision] Wonder escalation failed:', err instanceof Error ? err.message : err);
  }
  if (fast && fast.searchQuery) return Response.json(toVisionResult(fast, MUSE_FAST));

  const message = fastError instanceof MuseError ? fastError.message : NOT_IDENTIFIED;
  return Response.json({ error: message }, { status: 502 });
}
