// Pre-existing (Reskale): the shape of an eBay sold-listings answer, which the
// spoken summary reads aloud. Filled by app/api/sold+api.ts (ScrapeBadger).

export interface SoldComp {
  itemId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  soldPrice: number;
  shippingPrice: number | null;
  currency: string;
  soldDate: string | null;
  condition: string | null;
  bestOfferAccepted: boolean;
}

export interface SoldResult {
  comps: SoldComp[];
  summary: { count: number; median: number; low: number; high: number; bestOfferCount: number } | null;
  stale?: boolean;
}

/** Whether a sale is the item searched for. Absent: not checked, counts as the item. */
export type SaleRelevance = 'match' | 'accessory' | 'different';

export interface CheckedSale extends SoldComp {
  relevance?: SaleRelevance;
}

/** How the sales were checked against the item searched for. */
export interface SalesCheck {
  target: string;
  checked: boolean;
  leftOut: { accessory: number; different: number };
}

export interface SoldAnswer extends SoldResult {
  comps: CheckedSale[];
  /** eBay's count of EVERY sale matching the words (about 90 days), not just `comps`. Null when not given. */
  soldTotal: number | null;
  /** eBay's count of listings matching now. Null when not given. */
  activeTotal: number | null;
  relevance: SalesCheck | null;
  /** 'listing_average': each row is one listing, priced at the average of its sales. */
  rowKind: 'sale' | 'listing_average';
  fetchedAt: string | null;
}
