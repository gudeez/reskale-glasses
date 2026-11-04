// From the Reskale app: first written 2026-11-04, last changed 2026-11-04 (before this repo). See HACKATHON.md.
/**
 * The result sheet's profit calculator, said aloud: "Reskale, calculate …".
 * Pure, so it unit-tests in plain Node. Uses the calculator's default fees
 * and bins rate; the sheet shows the same numbers unless the seller has
 * edited those boxes.
 */

import { DEFAULT_BIN_RATE, listingCondition, minListPrice } from '@/constants/fees';
import {
  billableWeight,
  groundAdvantageEstimate,
  priorityEstimate,
  type BoxSize,
} from '@/lib/shipping/usps-estimate';

const SAY_WEIGHT = 'Say the weight, like: Reskale, cost to ship 2 pounds.';

/** "14 dollars and 5 cents": a speech engine reads "14.05" as "fourteen point oh five". */
export function spokenMoney(amount: number): string {
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  const dollars = `${whole} ${whole === 1 ? 'dollar' : 'dollars'}`;
  const change = `${rest} ${rest === 1 ? 'cent' : 'cents'}`;
  if (rest === 0) return dollars;
  return whole === 0 ? change : `${dollars} and ${change}`;
}

function spokenPounds(pounds: number): string {
  // Under a pound, as the seller says it: "8 ounces", not "0.5 pounds".
  const ounces = Number((pounds * 16).toFixed(1));
  if (pounds < 1) return `${ounces} ${ounces === 1 ? 'ounce' : 'ounces'}`;
  const n = Number(pounds.toFixed(2));
  return `${n} ${n === 1 ? 'pound' : 'pounds'}`;
}

/** "Reskale, calculate minimum list price based on 5 dollars." */
export function minListAnswer(buyPrice: number, condition: string | null): string {
  const bucket = listingCondition(condition);
  const times = bucket === 'new' ? 'twice' : 'three times';
  return `List it for at least ${spokenMoney(minListPrice(buyPrice, bucket))}. That makes ${times} your cost after eBay fees.`;
}

/** "Reskale, calculate cost to purchase at 3 pounds": the bins price, then what to list at. */
export function buyWeightAnswer(pounds: number, condition: string | null): string {
  // Rounded to the cent first, as the sheet's buy-price box is.
  const cost = Math.round(pounds * DEFAULT_BIN_RATE * 100) / 100;
  const list = minListPrice(cost, listingCondition(condition));
  return `${spokenPounds(pounds)} costs ${spokenMoney(cost)}. List it for at least ${spokenMoney(list)}.`;
}

/** "Reskale, calculate cost to ship at 2 pounds / 12 by 10 by 6": rough USPS retail, zone 5. */
export function shipCostAnswer(pounds: number | null, box: BoxSize | null): string {
  if (pounds === null && box === null) return SAY_WEIGHT;
  const { dimWeight, billable } = billableWeight(box, pounds ?? 0);
  if (pounds === null && dimWeight === null) {
    return `A box that size is priced by its weight. Say the weight too, like: Reskale, cost to ship 2 pounds.`;
  }

  const ground = groundAdvantageEstimate(billable);
  const priority = priorityEstimate(billable);
  const prices = [
    ground !== null ? `${spokenMoney(ground)} by Ground Advantage` : null,
    priority !== null ? `${spokenMoney(priority)} by Priority Mail` : null,
  ].filter((p): p is string => p !== null);
  if (prices.length === 0) return 'That’s past my price table. Get a live rate in the Shipping tab on your phone.';

  // USPS charges each started pound.
  const billed = Math.ceil(billable);
  const size =
    pounds === null
      ? `That box ships as at least ${billed} pounds. `
      : dimWeight !== null && billable > pounds
        ? `That box is billed as ${billed} pounds. `
        : '';
  return `${size}About ${prices.join(', or ')}.`;
}
