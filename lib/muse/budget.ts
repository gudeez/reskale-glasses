// Hackathon (Nov 4 2026): the hard cap on Muse spend ($150 of credits).
//
// Before a call, its worst case is reserved; afterwards the reservation is
// settled to what the call really cost. A call that would take spent + reserved
// past the cap is refused before anything is sent. The ledger is a git-ignored
// JSON file, so the cap holds across restarts of the dev server.

import { costUsd, type MuseModel, type MuseUsage } from './models';

export const DEFAULT_BUDGET_USD = 150;
export const BUDGET_SPENT = 'The Muse budget for this demo is used up.';

export interface Ledger {
  spentUsd: number;
  calls: Record<string, number>;
}

export class MuseBudgetError extends Error {
  constructor() {
    super(BUDGET_SPENT);
    this.name = 'MuseBudgetError';
  }
}

export function budgetUsd(env: string | undefined = process.env.MUSE_BUDGET_USD): number {
  const n = Number(env);
  return env !== undefined && env.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_BUDGET_USD;
}

/** Pure: may a call costing up to `worstCase` start, with `reserved` already out? */
export function canSpend(ledger: Ledger, reserved: number, worstCase: number, cap: number): boolean {
  return ledger.spentUsd + reserved + worstCase <= cap;
}

/** Pure: the ledger after a call settled. A call that failed before an answer costs nothing. */
export function settled(ledger: Ledger, model: MuseModel, usage: MuseUsage | null): Ledger {
  if (!usage) return ledger;
  return {
    spentUsd: ledger.spentUsd + costUsd(model, usage),
    calls: { ...ledger.calls, [model]: (ledger.calls[model] ?? 0) + 1 },
  };
}

/** A worst-case guess for one call: images are the big part of the input. */
export function worstCaseUsd(model: MuseModel, images: number): number {
  return costUsd(model, { prompt_tokens: 2_000 + images * 3_000, completion_tokens: 4_000 });
}

// ── The file-backed ledger (server only) ──

const LEDGER_FILE = '.muse-usage.json';
let ledger: Ledger | null = null;
let reserved = 0;

async function ledgerPath(): Promise<string> {
  const path = await import('node:path');
  return path.join(process.cwd(), LEDGER_FILE);
}

async function load(): Promise<Ledger> {
  if (ledger) return ledger;
  const fs = await import('node:fs/promises');
  try {
    const raw = JSON.parse(await fs.readFile(await ledgerPath(), 'utf8')) as Partial<Ledger>;
    ledger = { spentUsd: Number(raw.spentUsd) || 0, calls: raw.calls ?? {} };
  } catch {
    ledger = { spentUsd: 0, calls: {} };
  }
  return ledger;
}

async function save(next: Ledger): Promise<void> {
  ledger = next;
  const fs = await import('node:fs/promises');
  await fs.writeFile(await ledgerPath(), JSON.stringify(next, null, 2)).catch((err) => {
    console.warn('[muse] could not save the usage ledger:', err instanceof Error ? err.message : err);
  });
}

export interface Reservation {
  model: MuseModel;
  amount: number;
}

/** Hold the worst case for one call, or throw MuseBudgetError. */
export async function reserve(model: MuseModel, images: number): Promise<Reservation> {
  const current = await load();
  const amount = worstCaseUsd(model, images);
  if (!canSpend(current, reserved, amount, budgetUsd())) throw new MuseBudgetError();
  reserved += amount;
  return { model, amount };
}

/** Release the hold and record what the call really cost. */
export async function settle(reservation: Reservation, usage: MuseUsage | null): Promise<Ledger> {
  reserved = Math.max(0, reserved - reservation.amount);
  const next = settled(await load(), reservation.model, usage);
  if (usage) await save(next);
  const cap = budgetUsd();
  if (usage && next.spentUsd >= cap * 0.8) {
    console.warn(`[muse] ${Math.round((next.spentUsd / cap) * 100)}% of the $${cap} Muse budget is spent.`);
  }
  return next;
}
