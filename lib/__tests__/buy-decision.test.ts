// Hackathon (Nov 4 2026): the buy/pass agent's rules.
import { describe, expect, it } from 'vitest';
import { decide, FEE_SHARE } from '../agent/buy-decision';
import { spokenVerdict } from '../agent/spoken-verdict';

// eBay keeps 16.5% (13.5% final value + 3% promoted), so you keep 83.5%.
const keep = (sold: number) => Math.round(sold * (1 - FEE_SHARE) * 100) / 100;

describe('decide', () => {
  it('buys when both rules pass', () => {
    const d = decide({ buyPrice: 8, avgSoldPrice: 42, soldCount: 45, listedNow: 100 });
    expect(d.verdict).toBe('BUY');
    expect(d.netAfterFees).toBe(keep(42)); // 35.07
    expect(d.money).toBe(true);
    expect(d.speed).toBe(true);
  });

  it('passes on money alone, and says the most to pay', () => {
    const d = decide({ buyPrice: 5, avgSoldPrice: 12, soldCount: 80, listedNow: 100 });
    expect(d.verdict).toBe('PASS');
    expect(d.money).toBe(false);
    expect(d.speed).toBe(true);
    expect(d.maxBuyPrice).toBe(3.34); // 10.02 ÷ 3, rounded down
    expect(spokenVerdict(d)).toBe(
      'Pass. It sells for about 12 dollars, so you keep 10 dollars and 2 cents after eBay fees, only 2 times your 5 dollars. Pay 3 dollars and 34 cents or less to make 3 times.',
    );
  });

  it('passes on speed alone, even with no price', () => {
    const d = decide({ buyPrice: null, avgSoldPrice: 60, soldCount: 12, listedNow: 100 });
    expect(d.verdict).toBe('PASS');
    expect(d.speed).toBe(false);
    expect(spokenVerdict(d)).toBe('Pass. It sells too slowly: 12 percent sell through in 90 days, under 30.');
  });

  it('counts exactly 3x as a pass of the money rule', () => {
    // 10 × 0.835 = 8.35 kept; 3 × 2.7833 → pay 2.78 → 8.34 ≤ 8.35
    const d = decide({ buyPrice: 2.78, avgSoldPrice: 10, soldCount: 50, listedNow: 100 });
    expect(d.money).toBe(true);
    const over = decide({ buyPrice: 2.79, avgSoldPrice: 10, soldCount: 50, listedNow: 100 });
    expect(over.money).toBe(false);
  });

  it('needs MORE than 30% sell-through: exactly 30% fails', () => {
    expect(decide({ buyPrice: 1, avgSoldPrice: 50, soldCount: 30, listedNow: 100 }).verdict).toBe('PASS');
    expect(decide({ buyPrice: 1, avgSoldPrice: 50, soldCount: 31, listedNow: 100 }).verdict).toBe('BUY');
  });

  it('asks for the price when the market is good and the price is unknown', () => {
    const d = decide({ buyPrice: null, avgSoldPrice: 42, soldCount: 45, listedNow: 100 });
    expect(d.verdict).toBe('NEED_PRICE');
    expect(d.maxBuyPrice).toBe(11.69);
    expect(spokenVerdict(d)).toMatch(/^What’s the price\?.*Pay 11 dollars and 69 cents or less/);
  });

  it('never guesses: missing sold or listed counts are no call, not 0', () => {
    expect(decide({ buyPrice: 5, avgSoldPrice: null, soldCount: 10, listedNow: 20 }).verdict).toBe('NOT_ENOUGH_DATA');
    expect(decide({ buyPrice: 5, avgSoldPrice: 40, soldCount: null, listedNow: 20 }).verdict).toBe('NOT_ENOUGH_DATA');
    expect(decide({ buyPrice: 5, avgSoldPrice: 40, soldCount: 10, listedNow: null }).verdict).toBe('NOT_ENOUGH_DATA');
    // 0 listed can't give a rate.
    expect(decide({ buyPrice: 5, avgSoldPrice: 40, soldCount: 10, listedNow: 0 }).sellThrough).toBeNull();
  });

  it('treats a zero or negative price as no price', () => {
    expect(decide({ buyPrice: 0, avgSoldPrice: 42, soldCount: 45, listedNow: 100 }).verdict).toBe('NEED_PRICE');
  });

  it('says a buy verdict first', () => {
    const d = decide({ buyPrice: 8, avgSoldPrice: 42, soldCount: 45, listedNow: 100 });
    expect(spokenVerdict(d)).toBe(
      'Buy it. It sells for about 42 dollars, so you keep 35 dollars and 7 cents after eBay fees, 4.3 times your 8 dollars. 45 percent sell through in 90 days.',
    );
  });
});
