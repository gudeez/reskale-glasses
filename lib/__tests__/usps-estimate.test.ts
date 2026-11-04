// From the Reskale app: first written 2026-10-08, last changed 2026-10-08 (before this repo). See HACKATHON.md.
import { describe, expect, it } from 'vitest';
import {
  billableWeight,
  flatRateBoxes,
  groundAdvantageEstimate,
  priorityEstimate,
} from '@/lib/shipping/usps-estimate';

describe('billableWeight (USPS rules from July 12, 2026)', () => {
  it('ignores size for a box of one cubic foot or less', () => {
    // 12 × 10 × 4 = 480 cu in: the box from the device test. Billed on actual weight.
    expect(billableWeight({ l: 12, w: 10, h: 4 }, 2)).toEqual({ dimWeight: null, billable: 2 });
    expect(billableWeight({ l: 12, w: 12, h: 12 }, 1)).toEqual({ dimWeight: null, billable: 1 });
  });

  it('bills a box over one cubic foot at volume ÷ 139 when that is heavier', () => {
    const r = billableWeight({ l: 18, w: 12, h: 12 }, 3); // 2592 cu in → 18.65 lb
    expect(r.dimWeight).toBeCloseTo(2592 / 139, 6);
    expect(r.billable).toBeCloseTo(2592 / 139, 6);
  });

  it('rounds every side up to the next whole inch first', () => {
    // 12.1 → 13 on each side: 13³ = 2197 cu in, over the threshold.
    expect(billableWeight({ l: 12.1, w: 12.1, h: 12.1 }, 1).dimWeight).toBeCloseTo(2197 / 139, 6);
  });

  it('keeps the actual weight when it is heavier than the size weight', () => {
    expect(billableWeight({ l: 13, w: 13, h: 13 }, 40).billable).toBe(40);
  });

  it('uses actual weight when the box size is not given', () => {
    expect(billableWeight(null, 2.5)).toEqual({ dimWeight: null, billable: 2.5 });
  });
});

describe('price estimates', () => {
  it('prices Priority Mail by the pound bracket the weight falls in', () => {
    expect(priorityEstimate(0.4)).toBe(14.05);
    expect(priorityEstimate(1)).toBe(14.05);
    expect(priorityEstimate(1.01)).toBe(17.85);
    expect(priorityEstimate(4)).toBe(24.2);
  });

  it('gives no table price past the table, so the screen can point to a live rate', () => {
    expect(priorityEstimate(20.5)).toBeNull();
    expect(groundAdvantageEstimate(2.1)).toBeNull();
    expect(priorityEstimate(0)).toBeNull();
  });

  it('prices light parcels by Ground Advantage, which replaced First-Class Package', () => {
    expect(groundAdvantageEstimate(0.25)).toBe(9.35);
    expect(groundAdvantageEstimate(0.9)).toBe(11.7);
    expect(groundAdvantageEstimate(2)).toBe(14.85);
  });

  it('offers flat-rate boxes only up to their 70 lb limit', () => {
    expect(flatRateBoxes(5).map((b) => b.name)).toEqual([
      'Priority Mail Small Flat Rate Box',
      'Priority Mail Medium Flat Rate Box',
      'Priority Mail Large Flat Rate Box',
    ]);
    expect(flatRateBoxes(71)).toEqual([]);
  });
});
