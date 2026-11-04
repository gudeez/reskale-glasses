// Hackathon (Nov 4 2026): Muse speaks for Reskale in the glasses.
//
//   { question, facts }          a spoken question, answered from the last scan only
//   { verdict: true, facts, reasons }   the buy/pass verdict, in Muse's words
//
// The phone falls back to its own words whenever this fails, so a slow or
// spent Muse never leaves the seller in silence.

import { acceptVerdictSentence, askMessages, verdictMessages, type ScanFacts } from '@/lib/muse/ask';
import { museChat, MuseError } from '@/lib/muse/client';
import { MUSE_FAST } from '@/lib/muse/models';

const TIMEOUT_MS = 8_000;

function isFacts(v: unknown): v is ScanFacts {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { question?: unknown; facts?: unknown; verdict?: unknown; reasons?: unknown }
    | null;
  const facts = isFacts(body?.facts) ? body.facts : null;

  try {
    if (body?.verdict === true) {
      if (!facts?.verdict || typeof body.reasons !== 'string') {
        return Response.json({ error: 'Nothing to explain yet.' }, { status: 400 });
      }
      const reply = await museChat({
        model: MUSE_FAST,
        messages: verdictMessages(facts, body.reasons.slice(0, 600)),
        timeoutMs: TIMEOUT_MS,
      });
      const sentence = acceptVerdictSentence(reply.text, facts.verdict);
      if (!sentence) console.warn('[ask] Muse changed or blurred the verdict; using the rules’ own words.');
      return Response.json({ answer: sentence });
    }

    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) return Response.json({ error: 'Ask a question after Reskale.' }, { status: 400 });
    const reply = await museChat({ model: MUSE_FAST, messages: askMessages(question, facts), timeoutMs: TIMEOUT_MS });
    return Response.json({ answer: reply.text.replace(/\s+/g, ' ').slice(0, 400) });
  } catch (err) {
    const message = err instanceof MuseError ? err.message : 'Couldn’t reach Muse. Try again in a moment.';
    return Response.json({ error: message }, { status: 502 });
  }
}
