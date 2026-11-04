// Hackathon (Nov 4 2026): the phone's side of /api/ask. Returns null on any
// failure, so the caller says its own words instead of going quiet.

import { API_BASE_URL } from '@/lib/api-config';
import type { ScanFacts } from '@/lib/muse/ask';

const TIMEOUT_MS = 9_000;

async function post(body: object): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as { answer?: unknown } | null;
    return res.ok && typeof json?.answer === 'string' && json.answer.trim() ? json.answer.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Muse's answer to a spoken question, from the last scan only. */
export function askMuse(question: string, facts: ScanFacts | null): Promise<string | null> {
  return post({ question, facts });
}

/** The verdict in Muse's words, or null to use the rules' own (`reasons`). */
export function explainVerdict(facts: ScanFacts, reasons: string): Promise<string | null> {
  return post({ verdict: true, facts, reasons });
}
