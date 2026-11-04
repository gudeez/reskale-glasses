// Hackathon (Nov 4 2026): what Muse is told when it speaks for Reskale.
// Pure, so it unit-tests in Node.
//
// Muse answers only from the facts of the last scan, and never decides
// whether to buy: the rules in lib/agent/buy-decision.ts do. Muse only says
// the verdict in its own words, and a sentence that doesn't open with that
// verdict is thrown away.

import type { BuyVerdict } from '@/lib/agent/buy-decision';
import type { MuseMessage } from './client';

/** The last scan, as Muse may know it. Every number came from eBay or the seller; null is unknown. */
export interface ScanFacts {
  item: string | null;
  condition: string | null;
  typicalPrice: number | null;
  /** 'sold': median of eBay sales in ~90 days. 'asking': listings now (no sales found). */
  priceKind: 'sold' | 'asking' | null;
  newPrice: number | null;
  usedPrice: number | null;
  soldIn90Days: number | null;
  listedNow: number | null;
  sellThroughPct: number | null;
  buyPrice: number | null;
  verdict: BuyVerdict | null;
}

const VOICE = `Your words are read aloud by text-to-speech in the seller's smart glasses. At most 2 short sentences. Say money as "42 dollars", never with symbols. No lists, no markdown, no emoji.`;

export function askMessages(question: string, facts: ScanFacts | null): MuseMessage[] {
  return [
    {
      role: 'system',
      content: `You are Reskale, a sourcing assistant for an eBay reseller. ${VOICE}
Answer ONLY from the facts given. A null fact is unknown: say you don't know it from this scan, never guess a number. If there are no facts, say to scan something first. Never tell the seller to buy or pass; if they ask, tell them to say "Reskale, should I buy it".`,
    },
    {
      role: 'user',
      content: `Facts from the last scan (JSON): ${JSON.stringify(facts)}\n\nQuestion: ${question.trim().slice(0, 300)}`,
    },
  ];
}

const OPENING: Partial<Record<BuyVerdict, RegExp>> = {
  BUY: /^buy\b/i,
  PASS: /^pass\b/i,
};

export function verdictMessages(facts: ScanFacts, reasons: string): MuseMessage[] {
  return [
    {
      role: 'system',
      content: `You are Reskale, a sourcing assistant for an eBay reseller. ${VOICE}
Rules in code have already decided: ${facts.verdict}. Say that verdict in your own words. Start with "${facts.verdict === 'BUY' ? 'Buy' : 'Pass'}". Give the reason using only these numbers; do not change, round differently, or add any number.`,
    },
    { role: 'user', content: `Facts (JSON): ${JSON.stringify(facts)}\nThe rules' own reason: ${reasons}` },
  ];
}

/** Muse's sentence when it keeps the verdict and stays short; otherwise null (use the rules' own words). */
export function acceptVerdictSentence(text: string, verdict: BuyVerdict): string | null {
  const opening = OPENING[verdict];
  const said = text.trim().replace(/\s+/g, ' ');
  if (!opening || !opening.test(said) || said.length > 320) return null;
  // The other verdict must not appear: "Buy it... actually pass" is not a buy.
  const other = verdict === 'BUY' ? /\bpass\b/i : /\bbuy it\b/i;
  return other.test(said) ? null : said;
}
