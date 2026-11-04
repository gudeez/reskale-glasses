// Pre-existing (Reskale), moved here: the result sheet's filter and calculator
// types, which the glasses read and drive.

import type { BoxSize } from '@/lib/shipping/usps-estimate';

export type ConditionFilter = 'all' | 'used' | 'new' | 'open_box' | 'for_parts';

/** Numbers for the profit calculator from "Reskale, calculate …". */
export type CalculatorNumbers =
  | { tab: 'price'; buyPrice: number }
  | { tab: 'weight'; pounds: number }
  | { tab: 'shipping'; pounds: number | null; box: BoxSize | null };
