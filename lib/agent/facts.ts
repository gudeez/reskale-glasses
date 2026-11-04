// Hackathon (Nov 4 2026): the last scan as facts for Muse, and the agent's
// inputs from it. Pure.

import { marketSummary, type GlassesScanResult } from '@/lib/glasses/spoken-summary';
import type { ScanFacts } from '@/lib/muse/ask';
import type { BuyDecision, BuyInputs } from './buy-decision';

/** The agent judges on SOLD prices only: an asking price is not what things sell for. */
export function buyInputs(result: GlassesScanResult, buyPrice: number | null): BuyInputs {
  return {
    buyPrice,
    avgSoldPrice: result.sold?.summary?.median ?? null,
    soldCount: result.sold?.soldTotal ?? null,
    listedNow: result.listedNow ?? result.sold?.activeTotal ?? null,
  };
}

export function scanFacts(result: GlassesScanResult | null, buyPrice: number | null, decision: BuyDecision | null): ScanFacts | null {
  if (!result) return null;
  const m = marketSummary(result);
  return {
    item: result.title || null,
    condition: result.condition ?? null,
    typicalPrice: m.price,
    priceKind: m.priceKind,
    newPrice: m.newPrice,
    usedPrice: m.usedPrice,
    soldIn90Days: m.soldCount,
    listedNow: m.listedCount,
    sellThroughPct: m.sellThroughPct,
    buyPrice,
    verdict: decision?.verdict ?? null,
  };
}
