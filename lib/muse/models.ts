// Hackathon (Nov 4 2026): which Muse model does what, and what each costs.
//
// Spark is fast enough to answer while the seller is still holding the item;
// Wonder is only asked when Spark isn't sure. Never the -contributor tiers:
// Meta trains on that data, and these are sellers' photos.

export const MUSE_FAST = 'muse-spark-1.3';
export const MUSE_SMART = 'muse-wonder-1.0';
export type MuseModel = typeof MUSE_FAST | typeof MUSE_SMART;

/** US dollars per 1M tokens (dev.meta.ai pricing, read 2026-11-04). Reasoning tokens bill as output. */
export const MUSE_PRICES: Record<MuseModel, { input: number; output: number }> = {
  [MUSE_FAST]: { input: 1.25, output: 4.25 },
  [MUSE_SMART]: { input: 4.0, output: 20.0 },
};

/** Ask Wonder when Spark's own confidence is under this, or it couldn't name the item. */
export const ESCALATE_BELOW = 0.5;

export interface MuseUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export function costUsd(model: MuseModel, usage: MuseUsage): number {
  const price = MUSE_PRICES[model];
  return (usage.prompt_tokens * price.input + usage.completion_tokens * price.output) / 1_000_000;
}
