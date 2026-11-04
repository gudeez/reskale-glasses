// Hackathon (Nov 4 2026): the agent's verdict as it is said in the glasses.
// The fallback when Muse can't be reached, and the facts Muse is given.

import { spokenMoney } from '@/lib/glasses/spoken-calculator';
import { MIN_SELL_THROUGH, RETURN_MULTIPLE, type BuyDecision } from './buy-decision';

const pct = (rate: number) => `${Math.round(rate * 100)} percent`;
const times = (n: number) => `${Math.floor(n * 10) / 10} times`;
const NEED_PCT = Math.round(MIN_SELL_THROUGH * 100);

function moneyPart(d: BuyDecision): string | null {
  if (d.netAfterFees === null || d.avgSoldPrice === null) return null;
  const keep = `It sells for about ${spokenMoney(d.avgSoldPrice)}, so you keep ${spokenMoney(d.netAfterFees)} after eBay fees`;
  if (d.buyPrice === null || d.multiple === null) return `${keep}.`;
  return d.money
    ? `${keep}, ${times(d.multiple)} your ${spokenMoney(d.buyPrice)}.`
    : `${keep}, only ${times(d.multiple)} your ${spokenMoney(d.buyPrice)}.`;
}

function speedPart(d: BuyDecision): string | null {
  if (d.sellThrough === null) return null;
  return d.speed
    ? `${pct(d.sellThrough)} sell through in 90 days.`
    : `It sells too slowly: ${pct(d.sellThrough)} sell through in 90 days, under ${NEED_PCT}.`;
}

function maxPart(d: BuyDecision): string | null {
  if (d.maxBuyPrice === null || d.maxBuyPrice < 0.01) return null;
  return `Pay ${spokenMoney(d.maxBuyPrice)} or less to make ${RETURN_MULTIPLE} times.`;
}

/** One or two short sentences, verdict first. */
export function spokenVerdict(d: BuyDecision): string {
  const parts = (...p: (string | null)[]) => p.filter((s): s is string => s !== null).join(' ');
  switch (d.verdict) {
    case 'BUY':
      return parts('Buy it.', moneyPart(d), speedPart(d));
    case 'PASS':
      return parts(
        'Pass.',
        d.money === false ? moneyPart(d) : null,
        d.speed === false ? speedPart(d) : null,
        d.money === false ? maxPart(d) : null,
      );
    case 'NEED_PRICE':
      return parts('What’s the price? Say Reskale, it’s 5 dollars.', maxPart(d));
    case 'NOT_ENOUGH_DATA':
      return d.avgSoldPrice === null
        ? 'Not enough sold on eBay to call it. Your call on this one.'
        : 'I can’t tell how fast it sells, so I can’t call it. Your call on this one.';
  }
}

/** What the screen badge says. */
export const VERDICT_LABEL: Record<BuyDecision['verdict'], string> = {
  BUY: 'BUY',
  PASS: 'PASS',
  NEED_PRICE: 'PRICE?',
  NOT_ENOUGH_DATA: 'NO CALL',
};
