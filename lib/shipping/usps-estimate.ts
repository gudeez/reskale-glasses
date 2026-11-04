/**
 * Rough USPS retail prices for the shipping calculator. A guide for deciding
 * between box options — the eBay label quote on the same screen is the price
 * a seller actually pays, and is usually lower.
 *
 * Prices: USPS Notice 123, effective Oct 4, 2026, retail, zone 5 (601–1,000
 * miles) — https://pe.usps.com/text/dmm300/Notice123.htm. USPS changes these
 * several times a year (including temporary holiday prices), so re-check the
 * notice and move USPS_PRICES_AS_OF with every edit.
 *
 * Size rule from July 12, 2026: a box over one cubic foot is billed at
 * volume ÷ 139 when that beats its weight, with every side rounded up to the
 * next whole inch first. It applies to Priority Mail, Priority Mail Express,
 * Ground Advantage and Parcel Select.
 */

export const USPS_PRICES_AS_OF = 'Oct 4, 2026';

const DIM_DIVISOR = 139;
const DIM_MIN_CUBIC_INCHES = 1728; // one cubic foot; the rule applies only above it
const FLAT_RATE_MAX_LBS = 70;

/** [up to this many lbs, price] — Priority Mail retail, zone 5. */
const PRIORITY_ZONE5: readonly (readonly [number, number])[] = [
  [1, 14.05],
  [2, 17.85],
  [3, 19.05],
  [5, 24.2],
  [10, 30.75],
  [20, 51.25],
];

/** [up to this many lbs, price] — Ground Advantage retail, zone 5. */
const GROUND_ADVANTAGE_ZONE5: readonly (readonly [number, number])[] = [
  [0.5, 9.35],
  [1, 11.7],
  [2, 14.85],
];

const FLAT_RATE_BOXES = [
  { name: 'Priority Mail Small Flat Rate Box', price: 14.65 },
  { name: 'Priority Mail Medium Flat Rate Box', price: 25.8 },
  { name: 'Priority Mail Large Flat Rate Box', price: 36.1 },
] as const;

export interface BoxSize {
  l: number;
  w: number;
  h: number;
}

/** The weight USPS charges for: actual, or size weight for a box over one cubic foot. */
export function billableWeight(box: BoxSize | null, lbs: number): { dimWeight: number | null; billable: number } {
  if (!box || !(box.l > 0 && box.w > 0 && box.h > 0)) return { dimWeight: null, billable: lbs };
  const volume = Math.ceil(box.l) * Math.ceil(box.w) * Math.ceil(box.h);
  if (volume <= DIM_MIN_CUBIC_INCHES) return { dimWeight: null, billable: lbs };
  const dimWeight = volume / DIM_DIVISOR;
  return { dimWeight, billable: Math.max(lbs, dimWeight) };
}

function bracket(table: readonly (readonly [number, number])[], lbs: number): number | null {
  if (!(lbs > 0)) return null;
  return table.find(([max]) => lbs <= max)?.[1] ?? null;
}

/** Null past the table (over 20 lb): the screen points to a live rate instead. */
export const priorityEstimate = (billableLbs: number) => bracket(PRIORITY_ZONE5, billableLbs);

/** Null over 2 lb: the screen points to a live rate instead. */
export const groundAdvantageEstimate = (billableLbs: number) => bracket(GROUND_ADVANTAGE_ZONE5, billableLbs);

/** Flat-rate boxes ship anything that fits, up to 70 lb. */
export function flatRateBoxes(lbs: number) {
  return lbs <= FLAT_RATE_MAX_LBS ? FLAT_RATE_BOXES : [];
}
