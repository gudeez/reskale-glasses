// Hackathon (Nov 4 2026): one call to the Meta Model API (Muse), server only.
//
// OpenAI-compatible chat completions. Every call goes through the budget:
// reserved before it is sent, settled to its real cost after.

import { MuseBudgetError, reserve, settle } from './budget';
import { costUsd, EFFORT, type MuseModel, type MuseUsage } from './models';

const ENDPOINT = 'https://api.meta.ai/v1/chat/completions';

export type MusePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface MuseMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MusePart[];
}

export interface MuseJsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface MuseReply {
  text: string;
  model: MuseModel;
  usage: MuseUsage | null;
  costUsd: number;
}

/** Plain-English failure, safe to show a seller. */
export class MuseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MuseError';
  }
}

const UNREACHABLE = 'Couldn’t reach Muse. Try again in a moment.';

function imageCount(messages: MuseMessage[]): number {
  return messages.reduce(
    (n, m) => n + (Array.isArray(m.content) ? m.content.filter((p) => p.type === 'image_url').length : 0),
    0,
  );
}

function replyText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('');
  }
  return '';
}

export async function museChat({
  model,
  messages,
  json,
  timeoutMs = 20_000,
}: {
  model: MuseModel;
  messages: MuseMessage[];
  json?: MuseJsonSchema;
  timeoutMs?: number;
}): Promise<MuseReply> {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new MuseError('Muse isn’t set up on this server yet.');

  let reservation;
  try {
    reservation = await reserve(model, imageCount(messages));
  } catch (err) {
    if (err instanceof MuseBudgetError) throw new MuseError(err.message);
    throw err;
  }

  let usage: MuseUsage | null = null;
  const started = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        reasoning_effort: EFFORT[model],
        ...(json ? { response_format: { type: 'json_schema', json_schema: json } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((err: unknown) => {
      throw new MuseError(err instanceof Error && err.name === 'TimeoutError' ? 'Muse took too long. Try again.' : UNREACHABLE);
    });

    const body = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: unknown } }[]; usage?: Partial<MuseUsage>; error?: { message?: string } }
      | null;
    if (!res.ok || !body) {
      // The status and Meta's own message go to the server log only.
      console.warn(`[muse] ${model} HTTP ${res.status}: ${body?.error?.message ?? 'no body'}`);
      throw new MuseError(res.status === 429 ? 'Muse is busy. Try again in a moment.' : UNREACHABLE);
    }

    if (body.usage) {
      usage = { prompt_tokens: Number(body.usage.prompt_tokens) || 0, completion_tokens: Number(body.usage.completion_tokens) || 0 };
    }
    const text = replyText(body.choices?.[0]?.message?.content).trim();
    if (!text) throw new MuseError(UNREACHABLE);
    const cost = usage ? costUsd(model, usage) : 0;
    return { text, model, usage, costUsd: cost };
  } finally {
    const ledger = await settle(reservation, usage);
    const cost = usage ? costUsd(model, usage) : 0;
    console.log(
      `[muse] ${model} ${Date.now() - started}ms in=${usage?.prompt_tokens ?? '?'} out=${usage?.completion_tokens ?? '?'} ` +
        `$${cost.toFixed(4)} total=$${ledger.spentUsd.toFixed(4)}`,
    );
  }
}
