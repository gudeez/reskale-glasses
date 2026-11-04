// Hackathon (Nov 4 2026): what Muse is asked when it identifies an item, and
// how its answer becomes the scan result. Pure, so it unit-tests in Node.
//
// The search-query rules are Reskale's (pre-existing, tuned on real eBay
// searches); the schema, price-tag reading and escalation are new.

import type { VisionResult } from '@/lib/google-vision';
import type { MuseJsonSchema, MuseMessage, MusePart } from './client';
import { ESCALATE_BELOW } from './models';

export interface MuseIdentity {
  brand: string;
  model: string;
  category: string;
  condition: 'New' | 'Like New' | 'Used' | 'For Parts' | 'Unknown';
  searchQuery: string;
  confidence: number;
  /** 0 when no price tag is visible. */
  priceTagUsd: number;
}

const CONDITIONS = ['New', 'Like New', 'Used', 'For Parts', 'Unknown'] as const;

export const IDENTITY_SCHEMA: MuseJsonSchema = {
  name: 'item_identity',
  schema: {
    type: 'object',
    properties: {
      brand: { type: 'string' },
      model: { type: 'string' },
      category: { type: 'string' },
      condition: { type: 'string', enum: [...CONDITIONS] },
      searchQuery: { type: 'string' },
      confidence: { type: 'number' },
      priceTagUsd: { type: 'number' },
    },
    required: ['brand', 'model', 'category', 'condition', 'searchQuery', 'confidence', 'priceTagUsd'],
    additionalProperties: false,
  },
};

const PROMPT = `You are an expert eBay product identifier. A reseller is sourcing in a thrift store, hands-free, through smart glasses. Identify the main product in the photo for resale on eBay. Several photos are the SAME item from different angles.

Return JSON:
- brand: exact brand from a logo or printed text; "" if you can't read one
- model: exact model name/number from printed text; "" if none is readable. Never invent a model number.
- category: "Category / Subcategory"
- condition: New, Like New, Used, For Parts, or Unknown when the photo doesn't show it
- searchQuery: an optimized eBay search query
- confidence: 0 to 1, how sure you are of the EXACT product (not just the kind of thing)
- priceTagUsd: the store's asking price on a visible price tag or sticker, in US dollars; 0 if no price tag is visible. Never put a market value here.

RULES:
- searchQuery must be SHORT (4-8 words). Always include: brand + model/product type. ALSO include size/capacity (e.g. "18oz", "32oz", "Large") whenever it's printed on the item or clearly inferable from the photo; these are price-defining variants on eBay. Include color ONLY when it's distinctive and you can name it confidently.
- GOOD queries: "Yeti Rambler 18oz Silver", "Hydro Flask Wide Mouth 32oz", "Stanley Quencher 40oz Rose Quartz"
- BAD (too vague): "Yeti tumbler". BAD (too verbose): "Hydro Flask insulated tumbler light blue grey 32 oz water bottle"
- If several products are visible, identify the main/center one.
- If you can't tell what it is, still give your best short guess as searchQuery, with confidence under 0.3.`;

/** The messages for one identify call. `images` are base64 JPEG, no data: prefix. */
export function identifyMessages(images: string[], hint?: string | null): MuseMessage[] {
  const text = hint?.trim()
    ? `${PROMPT}\n\nIts barcode was looked up as: "${hint.trim().slice(0, 200)}". Trust the photo where they disagree.`
    : PROMPT;
  const parts: MusePart[] = [
    { type: 'text', text },
    ...images.map((b64): MusePart => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
  ];
  return [{ role: 'user', content: parts }];
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Muse's reply as an identity, or null when it isn't one. */
export function parseIdentity(text: string): MuseIdentity | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const condition = CONDITIONS.find((c) => c.toLowerCase() === str(o.condition).toLowerCase()) ?? 'Unknown';
  const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0;
  const tag = typeof o.priceTagUsd === 'number' && Number.isFinite(o.priceTagUsd) && o.priceTagUsd > 0 ? o.priceTagUsd : 0;
  return {
    brand: str(o.brand),
    model: str(o.model),
    category: str(o.category),
    condition,
    searchQuery: str(o.searchQuery).slice(0, 120),
    confidence,
    priceTagUsd: Math.round(tag * 100) / 100,
  };
}

/** Ask the smarter model when the fast one isn't sure, or couldn't name the item. */
export function needsEscalation(identity: MuseIdentity | null): boolean {
  return !identity || identity.confidence < ESCALATE_BELOW || identity.searchQuery === '';
}

/** The scan result the app already knows how to show and say. */
export function toVisionResult(identity: MuseIdentity, model: string): VisionResult {
  const query = identity.searchQuery || `${identity.brand} ${identity.model}`.trim() || 'Unknown Item';
  const seen = identity.condition !== 'Unknown';
  return {
    brand: identity.brand,
    model: identity.model,
    category: identity.category || 'General',
    condition: seen ? identity.condition : 'Used',
    conditionSeen: seen,
    bestGuessLabel: query,
    searchQuery: query,
    webEntities: [{ description: query, score: identity.confidence }],
    matchingPages: [],
    suggestedQueries: [],
    priceTagUsd: identity.priceTagUsd > 0 ? identity.priceTagUsd : null,
    confidence: identity.confidence,
    identifiedBy: model,
  };
}
