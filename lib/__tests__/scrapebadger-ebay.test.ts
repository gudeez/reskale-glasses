// Hackathon (Nov 4 2026): ScrapeBadger sold-page parsing and the typical sold price.
import { describe, expect, it } from 'vitest';
import {
  buildSoldAnswer,
  parseSoldPage,
  percentile,
  readPage,
  summarizeSold,
  toCount,
  toScrapeBadgerSoldComp,
} from '../sold-comps/scrapebadger-ebay';
import type { SoldComp } from '../sold-comps/sold';

function row(id: string, price: string | number | null, extra: Record<string, unknown> = {}) {
  return {
    item_id: id,
    title: `Nintendo 64 console ${id}`,
    url: `https://www.ebay.com/itm/${id}`,
    image: 'https://i.ebayimg.com/images/g/abc/s-l500.jpg',
    price: price === null ? null : { value: price, currency: 'USD' },
    shipping_cost: { value: '5.99' },
    free_shipping: false,
    condition: 'Pre-Owned',
    buying_format: 'Buy It Now',
    sold_date_at: '2026-10-30',
    ...extra,
  };
}

/** A completed-listings page as ScrapeBadger sends it: totals as strings. */
const COMPLETED = {
  results: [
    row('100000001', '40.00'),
    row('100000002', 20),
    row('100000003', '30.00'),
    row('100000004', '99.00', { buying_format: 'Best Offer' }),
    row('100000005', null),
    row('100000006', '0'),
    row('100000007', '25.00', { url: 'https://evil.example.com/itm/7' }),
    row('100000008', '25.00', { price: { value: '25.00', currency: 'GBP' } }),
    { title: 'no id' },
  ],
  pagination: { total_results: '1,234', current_page: 1 },
};

function comp(soldPrice: number, bestOfferAccepted = false): SoldComp {
  return {
    itemId: `id-${soldPrice}-${bestOfferAccepted}`,
    title: 't',
    url: 'https://www.ebay.com/itm/1',
    imageUrl: null,
    soldPrice,
    shippingPrice: null,
    currency: 'USD',
    soldDate: '2026-10-30',
    condition: null,
    bestOfferAccepted,
  };
}

describe('toCount', () => {
  it('reads counts sent as numbers or strings', () => {
    expect(toCount('1,234')).toBe(1234);
    expect(toCount(56)).toBe(56);
    expect(toCount('about 50')).toBeNull();
    expect(toCount(-1)).toBeNull();
    expect(toCount(null)).toBeNull();
  });
});

describe('toScrapeBadgerSoldComp', () => {
  it('maps a sold row', () => {
    expect(toScrapeBadgerSoldComp(row('100000001', '40.00'))).toEqual({
      itemId: '100000001',
      title: 'Nintendo 64 console 100000001',
      url: 'https://www.ebay.com/itm/100000001',
      imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l500.jpg',
      soldPrice: 40,
      shippingPrice: 5.99,
      currency: 'USD',
      soldDate: '2026-10-30',
      condition: 'Pre-Owned',
      bestOfferAccepted: false,
    });
  });

  it('flags a Best Offer row, whose price is the ask', () => {
    expect(toScrapeBadgerSoldComp(row('1', '99', { buying_format: 'Best Offer' }))?.bestOfferAccepted).toBe(true);
  });

  it('says free shipping is 0 and unknown shipping is null', () => {
    expect(toScrapeBadgerSoldComp(row('1', '9', { shipping_cost: null, free_shipping: true }))?.shippingPrice).toBe(0);
    expect(toScrapeBadgerSoldComp(row('1', '9', { shipping_cost: null, free_shipping: null }))?.shippingPrice).toBeNull();
  });

  it('keeps no date it cannot read', () => {
    expect(toScrapeBadgerSoldComp(row('1', '9', { sold_date_at: 'Oct 30' }))?.soldDate).toBeNull();
  });
});

describe('parseSoldPage', () => {
  it('drops rows with no price, a non-eBay link, another currency or no id; reads the string total', () => {
    const { comps, soldTotal } = parseSoldPage(COMPLETED);
    expect(comps.map((c) => c.itemId)).toEqual(['100000001', '100000002', '100000003', '100000004']);
    expect(soldTotal).toBe(1234);
  });

  it('gives no total, never 0, when eBay sent none', () => {
    expect(parseSoldPage({ results: [] }).soldTotal).toBeNull();
    expect(readPage({ results: [], pagination: { total_results: null } })?.total).toBeNull();
  });

  it('refuses an answer that is not a results page', () => {
    expect(() => parseSoldPage({ error: 'nope' })).toThrow(/no results array/);
    expect(readPage(null)).toBeNull();
  });
});

describe('summarizeSold', () => {
  it('gives the median and middle-half range of plain sales', () => {
    expect(summarizeSold([comp(40), comp(10), comp(30), comp(20), comp(50)])).toEqual({
      count: 5,
      median: 30,
      low: 20,
      high: 40,
      bestOfferCount: 0,
    });
  });

  it('leaves Best Offer asks out of the prices but counts them', () => {
    const s = summarizeSold([comp(10), comp(20), comp(30), comp(99, true), comp(98, true)]);
    expect(s).toEqual({ count: 3, median: 20, low: 15, high: 25, bestOfferCount: 2 });
  });

  it('has no typical price from Best Offer asks alone, from nothing, or from under 3 sales', () => {
    expect(summarizeSold([comp(99, true)])).toBeNull();
    expect(summarizeSold([])).toBeNull();
    expect(summarizeSold([comp(10), comp(20), comp(99, true)])).toBeNull();
  });

  it('prices from the parsed page without the Best Offer row', () => {
    // 20, 30, 40 sold; 99 was an ask.
    expect(summarizeSold(parseSoldPage(COMPLETED).comps)?.median).toBe(30);
  });
});

describe('percentile', () => {
  it('interpolates between neighbours', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([7], 0.75)).toBe(7);
  });
});

describe('buildSoldAnswer', () => {
  it('answers in the SoldAnswer shape', () => {
    const comps = [comp(10), comp(20), comp(30)];
    const answer = buildSoldAnswer({ comps, soldTotal: 12 }, null, '2026-11-04T21:00:00.000Z');
    expect(answer).toEqual({
      comps,
      summary: { count: 3, median: 20, low: 15, high: 25, bestOfferCount: 0 },
      soldTotal: 12,
      activeTotal: null,
      relevance: null,
      rowKind: 'sale',
      fetchedAt: '2026-11-04T21:00:00.000Z',
    });
  });
});
