import { describe, it, expect } from 'vitest';
import {
  answerQuestion,
  identitySentence,
  marketSentence,
  marketSummary,
  spokenSummary,
  spokenTitle,
  type GlassesScanResult,
} from '@/lib/glasses/spoken-summary';
import type { EbaySearchResult } from '@/lib/ebay';
import type { CheckedSale, SoldAnswer } from '@/lib/sold-comps/sold';

const NO_LISTINGS: EbaySearchResult = { items: [], avgPriceUsed: null, avgPriceNew: null, totalResults: 0 };

function sale(soldPrice: number, condition: string | null): CheckedSale {
  return {
    itemId: '',
    title: '',
    url: '',
    imageUrl: null,
    soldPrice,
    shippingPrice: null,
    currency: 'USD',
    soldDate: null,
    condition,
    bestOfferAccepted: false,
  };
}

function sold(over: Partial<SoldAnswer> = {}): SoldAnswer {
  return {
    comps: [sale(16, 'Used'), sale(18, 'Pre-owned'), sale(20, 'Used'), sale(25, 'New'), sale(27, 'Brand New'), sale(30, 'New')],
    summary: { count: 6, median: 22.5, low: 16, high: 30, bestOfferCount: 0 },
    soldTotal: 190,
    activeTotal: 312,
    relevance: null,
    rowKind: 'sale',
    fetchedAt: null,
    stale: false,
    ...over,
  };
}

function result(over: Partial<GlassesScanResult> = {}): GlassesScanResult {
  return {
    title: 'Stanley 25 ft FatMax tape measure',
    condition: null,
    ebay: NO_LISTINGS,
    sold: null,
    listedNow: null,
    soldError: null,
    ...over,
  };
}

describe('marketSummary', () => {
  it('splits sold prices by condition and works out sell-through from exact counts', () => {
    expect(marketSummary(result({ sold: sold(), listedNow: 312 }))).toEqual({
      listedCount: 312,
      soldCount: 190,
      newPrice: 27,
      usedPrice: 18,
      price: 22.5,
      priceKind: 'sold',
      sellThroughPct: 61,
    });
  });

  it("never works out sell-through from the Browse search's total", () => {
    const ebay: EbaySearchResult = { ...NO_LISTINGS, totalResults: 400 };
    const m = marketSummary(result({ ebay, sold: sold({ activeTotal: null }), listedNow: null }));
    expect(m.listedCount).toBe(400); // said as a count of listings only
    expect(m.sellThroughPct).toBeNull();
  });

  it("falls back to the listings' asking price when there is no sold data", () => {
    const ebay: EbaySearchResult = { ...NO_LISTINGS, avgPriceUsed: 25.4, totalResults: 3 };
    expect(marketSummary(result({ ebay }))).toMatchObject({ price: 25.4, priceKind: 'asking', soldCount: null });
  });
});

describe('identitySentence', () => {
  it('names the item and the condition it saw', () => {
    expect(identitySentence({ title: 'Stanley 25 ft FatMax tape measure', condition: 'Used' })).toBe(
      'Stanley 25 ft FatMax tape measure. Looks used.',
    );
    expect(identitySentence({ title: 'Dell monitor', condition: 'Like New' })).toBe('Dell monitor. Looks like new.');
    expect(identitySentence({ title: 'Dell monitor', condition: 'For Parts' })).toBe(
      'Dell monitor. Looks like it is for parts.',
    );
  });

  it('says no condition when none was seen', () => {
    expect(identitySentence({ title: 'Dell monitor', condition: null })).toBe('Dell monitor.');
  });
});

describe('marketSentence', () => {
  it('says counts, prices new and used, and sell-through', () => {
    expect(marketSentence(result({ sold: sold(), listedNow: 312 }))).toBe(
      '312 listed, 190 sold in 90 days. Used sell for about 18 dollars, new about 27 dollars. Sell-through 61 percent.',
    );
  });

  it('leaves out what is unknown instead of saying zero', () => {
    const text = marketSentence(result({ sold: sold({ soldTotal: null, activeTotal: null, comps: [] }) }));
    expect(text).toBe('Sells for about 23 dollars.');
    expect(text).not.toMatch(/\b0\b/);
  });

  it('says one band when only one has enough sales', () => {
    const comps = [sale(10, 'Used'), sale(12, 'Used'), sale(14, 'Used'), sale(50, 'New')];
    expect(marketSentence(result({ sold: sold({ comps, soldTotal: null, activeTotal: null }) }))).toBe(
      'Used sell for about 12 dollars.',
    );
  });

  it('says a tiny sell-through as under 1 percent, not 0', () => {
    expect(marketSentence(result({ sold: sold({ soldTotal: 1, comps: [] }), listedNow: 500 }))).toContain(
      'Sell-through under 1 percent.',
    );
  });

  it('explains missing sold prices', () => {
    expect(marketSentence(result({ soldError: 'failed' }))).toBe("Couldn't get sold prices right now.");
    expect(marketSentence(result({ soldError: 'out_of_lookups' }))).toBe("You're out of sold-price lookups this month.");
  });

  it('says when no prices were found', () => {
    expect(marketSentence(result())).toBe('No prices found yet.');
  });

  it('uses the singular for one dollar and no separators for thousands', () => {
    expect(marketSentence(result({ ebay: { ...NO_LISTINGS, avgPriceUsed: 0.8, totalResults: 1 } }))).toBe(
      '1 listed. Listed for about 1 dollar.',
    );
    expect(marketSentence(result({ ebay: { ...NO_LISTINGS, avgPriceUsed: 1249.6 } }))).toBe(
      'Listed for about 1250 dollars.',
    );
  });
});

describe('spokenTitle', () => {
  it('drops URLs and symbols and keeps it short', () => {
    expect(spokenTitle('Nike #Tech & Fleece | Hoodie https://ebay.com/x L/XL')).toBe('Nike Tech and Fleece Hoodie L XL');
    expect(spokenTitle('one two three four five six seven eight nine ten eleven twelve thirteen')).toBe(
      'one two three four five six seven eight nine ten eleven twelve',
    );
  });
});

describe('spokenSummary', () => {
  it('is both parts together, for Hold to repeat', () => {
    expect(spokenSummary({ kind: 'found', result: result({ condition: 'Used', sold: sold(), listedNow: 312 }) })).toBe(
      'Stanley 25 ft FatMax tape measure. Looks used. 312 listed, 190 sold in 90 days. Used sell for about 18 dollars, new about 27 dollars. Sell-through 61 percent.',
    );
  });

  it('says what to try when nothing was found', () => {
    expect(spokenSummary({ kind: 'not_found' })).toBe("Couldn't find that one. Try the brand tag or the barcode.");
  });

  it('points to the phone when out of scans or when it failed', () => {
    expect(spokenSummary({ kind: 'quota' })).toBe("You're out of scans. Check your phone.");
    expect(spokenSummary({ kind: 'failed' })).toBe("That didn't work. Check your phone.");
  });

  it('never reads out symbols', () => {
    const text = spokenSummary({
      kind: 'found',
      result: result({ title: 'Levi’s 501 $$ jeans', sold: sold(), listedNow: 312 }),
    });
    expect(text).not.toMatch(/[$%#&|/]/);
  });
});

describe('answerQuestion', () => {
  const full = result({ sold: sold(), listedNow: 312 });

  it('answers from the last result', () => {
    expect(answerQuestion('new_price', full)).toBe('New sell for about 27 dollars.');
    expect(answerQuestion('used_price', full)).toBe('Used sell for about 18 dollars.');
    expect(answerQuestion('sold_count', full)).toBe('190 sold in 90 days.');
    expect(answerQuestion('listed_count', full)).toBe('312 listed now.');
    expect(answerQuestion('sell_through', full)).toBe('Sell-through 61 percent.');
    expect(answerQuestion('identity', full)).toBe('Stanley 25 ft FatMax tape measure.');
    expect(answerQuestion('price', full)).toBe('Used sell for about 18 dollars, new about 27 dollars.');
  });

  it('says a number is unknown, never 0', () => {
    const bare = result();
    for (const q of ['sold_count', 'listed_count', 'sell_through', 'price'] as const) {
      expect(answerQuestion(q, bare)).toBe("I don't have that one.");
    }
    expect(answerQuestion('new_price', bare)).toBe('Not enough new sales to say.');
  });

  it('asks for a scan first when there is nothing yet', () => {
    expect(answerQuestion('price', null)).toBe('Scan something first.');
  });
});

describe('spokenSummary — cancelled', () => {
  it('says when a cancelled scan still counted', () => {
    expect(spokenSummary({ kind: 'cancelled', scanUsed: false })).toBe('Cancelled.');
    expect(spokenSummary({ kind: 'cancelled', scanUsed: true })).toBe('Cancelled. That scan was already used.');
  });
});
