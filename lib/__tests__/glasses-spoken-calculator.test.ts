import { describe, expect, it } from 'vitest';
import { buyWeightAnswer, minListAnswer, shipCostAnswer, spokenMoney } from '../glasses/spoken-calculator';

describe('spokenMoney', () => {
  it('says cents as cents, never as a decimal', () => {
    expect(spokenMoney(18)).toBe('18 dollars');
    expect(spokenMoney(1)).toBe('1 dollar');
    expect(spokenMoney(14.05)).toBe('14 dollars and 5 cents');
    expect(spokenMoney(5.01)).toBe('5 dollars and 1 cent');
    expect(spokenMoney(17.999999)).toBe('18 dollars');
  });
});

describe('minListAnswer', () => {
  it('aims for three times the cost on a used item', () => {
    // 5 × 3 ÷ (1 − 13.5% − 3%) = 17.96
    expect(minListAnswer(5, 'Used - good')).toBe(
      'List it for at least 17 dollars and 96 cents. That makes three times your cost after eBay fees.',
    );
  });

  it('aims for twice the cost on a new one', () => {
    // 10 × 2 ÷ 0.835 = 23.95
    expect(minListAnswer(10, 'New')).toBe(
      'List it for at least 23 dollars and 95 cents. That makes twice your cost after eBay fees.',
    );
  });

  it('treats an unknown condition as used, the safer target', () => {
    expect(minListAnswer(5, null)).toBe(minListAnswer(5, 'Used'));
  });
});

describe('buyWeightAnswer', () => {
  it('prices the weight at the bins rate, then the list price', () => {
    // 3 lb × 1.67 = 5.01; 5.01 × 3 ÷ 0.835 = 18.00
    expect(buyWeightAnswer(3, null)).toBe('3 pounds costs 5 dollars and 1 cent. List it for at least 18 dollars.');
  });

  it('says under a pound in ounces, and the rest in pounds', () => {
    expect(buyWeightAnswer(1, null)).toMatch(/^1 pound costs 1 dollar and 67 cents\./);
    expect(buyWeightAnswer(0.75, null)).toMatch(/^12 ounces costs 1 dollar and 25 cents\./);
    expect(buyWeightAnswer(0.5, null)).toMatch(/^8 ounces costs 84 cents\./);
    expect(buyWeightAnswer(1 / 16, null)).toMatch(/^1 ounce costs/);
    expect(buyWeightAnswer(1.25, null)).toMatch(/^1\.25 pounds costs/);
  });
});

describe('shipCostAnswer', () => {
  it('gives Ground Advantage and Priority Mail when both are in the table', () => {
    expect(shipCostAnswer(1, null)).toBe(
      'About 11 dollars and 70 cents by Ground Advantage, or 14 dollars and 5 cents by Priority Mail.',
    );
  });

  it('gives Priority Mail alone past 2 pounds', () => {
    expect(shipCostAnswer(4, null)).toBe('About 24 dollars and 20 cents by Priority Mail.');
  });

  it('says when a big box is billed by its size', () => {
    // 18 × 12 × 12 = 2592 cubic inches ÷ 139 = 18.6 lb
    expect(shipCostAnswer(2, { l: 18, w: 12, h: 12 })).toBe(
      'That box is billed as 19 pounds. About 51 dollars and 25 cents by Priority Mail.',
    );
  });

  it('prices a big box with no weight at its size, as a floor', () => {
    expect(shipCostAnswer(null, { l: 18, w: 12, h: 12 })).toBe(
      'That box ships as at least 19 pounds. About 51 dollars and 25 cents by Priority Mail.',
    );
  });

  it('asks for the weight when the box is too small to be billed by size', () => {
    expect(shipCostAnswer(null, { l: 12, w: 10, h: 6 })).toBe(
      'A box that size is priced by its weight. Say the weight too, like: Reskale, cost to ship 2 pounds.',
    );
  });

  it('points to the live rate past the price table', () => {
    expect(shipCostAnswer(25, null)).toBe(
      'That’s past my price table. Get a live rate in the Shipping tab on your phone.',
    );
  });

  it('asks how to say it when it heard no size at all', () => {
    expect(shipCostAnswer(null, null)).toBe('Say the weight, like: Reskale, cost to ship 2 pounds.');
  });
});
