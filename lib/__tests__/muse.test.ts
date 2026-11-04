// Hackathon (Nov 4 2026): the Muse budget, identify parsing, escalation and the verdict guard.
import { describe, expect, it } from 'vitest';
import { acceptVerdictSentence, askMessages, verdictMessages, type ScanFacts } from '../muse/ask';
import { budgetUsd, canSpend, settled, worstCaseUsd, DEFAULT_BUDGET_USD } from '../muse/budget';
import { identifyMessages, needsEscalation, parseIdentity, toVisionResult } from '../muse/identify';
import { costUsd, MUSE_FAST, MUSE_SMART } from '../muse/models';

describe('Muse cost', () => {
  it('prices Spark and Wonder per million tokens', () => {
    expect(costUsd(MUSE_FAST, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBeCloseTo(5.5);
    expect(costUsd(MUSE_SMART, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBeCloseTo(24);
  });
});

describe('the $150 budget', () => {
  const empty = { spentUsd: 0, calls: {} };

  it('defaults to 150 dollars and reads MUSE_BUDGET_USD', () => {
    expect(budgetUsd(undefined)).toBe(DEFAULT_BUDGET_USD);
    expect(DEFAULT_BUDGET_USD).toBe(150);
    expect(budgetUsd('0.01')).toBe(0.01);
    expect(budgetUsd('')).toBe(150);
    expect(budgetUsd('lots')).toBe(150);
    expect(budgetUsd('-5')).toBe(150);
  });

  it('refuses a call whose worst case would pass the cap, counting calls still out', () => {
    const worst = worstCaseUsd(MUSE_SMART, 1);
    expect(canSpend(empty, 0, worst, 150)).toBe(true);
    expect(canSpend({ spentUsd: 149.99, calls: {} }, 0, worst, 150)).toBe(false);
    expect(canSpend({ spentUsd: 100, calls: {} }, 49.99, worst, 150)).toBe(false);
    expect(canSpend(empty, 0, worst, 0.01)).toBe(false);
  });

  it('settles a call to what it really cost, and a failed call to nothing', () => {
    const after = settled(empty, MUSE_FAST, { prompt_tokens: 2_000, completion_tokens: 200 });
    expect(after.spentUsd).toBeCloseTo(0.00335);
    expect(after.calls[MUSE_FAST]).toBe(1);
    expect(settled(after, MUSE_SMART, null)).toBe(after);
  });
});

describe('identify', () => {
  const answer = {
    brand: 'Yeti',
    model: 'Rambler',
    category: 'Home / Drinkware',
    condition: 'Used',
    searchQuery: 'Yeti Rambler 18oz Silver',
    confidence: 0.82,
    priceTagUsd: 4.99,
  };

  it('sends the photos as data URLs in the user message', () => {
    const [message] = identifyMessages(['AAA', 'BBB'], 'Yeti Rambler');
    expect(message.role).toBe('user');
    const parts = message.content as { type: string; image_url?: { url: string }; text?: string }[];
    expect(parts.filter((p) => p.type === 'image_url').map((p) => p.image_url!.url)).toEqual([
      'data:image/jpeg;base64,AAA',
      'data:image/jpeg;base64,BBB',
    ]);
    expect(parts[0].text).toContain('Its barcode was looked up as: "Yeti Rambler"');
  });

  it('reads Muse’s JSON, fenced or not', () => {
    expect(parseIdentity(JSON.stringify(answer))).toEqual(answer);
    expect(parseIdentity('```json\n' + JSON.stringify(answer) + '\n```')?.searchQuery).toBe('Yeti Rambler 18oz Silver');
    expect(parseIdentity('not json')).toBeNull();
  });

  it('cleans what it can’t trust: confidence 0–1, no negative or missing tag, unknown condition', () => {
    const odd = parseIdentity(JSON.stringify({ ...answer, confidence: 7, priceTagUsd: -2, condition: 'mint' }))!;
    expect(odd.confidence).toBe(1);
    expect(odd.priceTagUsd).toBe(0);
    expect(odd.condition).toBe('Unknown');
  });

  it('escalates to Wonder only when Spark isn’t sure', () => {
    expect(needsEscalation(parseIdentity(JSON.stringify(answer)))).toBe(false);
    expect(needsEscalation(parseIdentity(JSON.stringify({ ...answer, confidence: 0.49 })))).toBe(true);
    expect(needsEscalation(parseIdentity(JSON.stringify({ ...answer, searchQuery: '' })))).toBe(true);
    expect(needsEscalation(null)).toBe(true);
    // Exactly 0.5 is sure enough.
    expect(needsEscalation(parseIdentity(JSON.stringify({ ...answer, confidence: 0.5 })))).toBe(false);
  });

  it('becomes the scan result the app reads, with the tag and the model', () => {
    const v = toVisionResult(parseIdentity(JSON.stringify(answer))!, MUSE_FAST);
    expect(v.searchQuery).toBe('Yeti Rambler 18oz Silver');
    expect(v.conditionSeen).toBe(true);
    expect(v.priceTagUsd).toBe(4.99);
    expect(v.identifiedBy).toBe(MUSE_FAST);
    expect(v.matchingPages).toEqual([]);
    const unseen = toVisionResult(parseIdentity(JSON.stringify({ ...answer, condition: 'Unknown', priceTagUsd: 0 }))!, MUSE_SMART);
    expect(unseen.condition).toBe('Used');
    expect(unseen.conditionSeen).toBe(false);
    expect(unseen.priceTagUsd).toBeNull();
  });
});

describe('Muse speaking for Reskale', () => {
  const facts: ScanFacts = {
    item: 'Yeti Rambler 18oz',
    condition: null,
    typicalPrice: 22,
    priceKind: 'sold',
    newPrice: null,
    usedPrice: 21,
    soldIn90Days: 140,
    listedNow: 300,
    sellThroughPct: 47,
    buyPrice: 5,
    verdict: 'BUY',
  };

  it('gives Muse the facts and only the facts', () => {
    const [system, user] = askMessages('what does it sell for', facts);
    expect(system.content).toMatch(/ONLY from the facts/);
    expect(system.content).toMatch(/never guess a number/);
    expect(user.content).toContain(JSON.stringify(facts));
    expect(user.content).toContain('Question: what does it sell for');
  });

  it('tells Muse the verdict is already decided', () => {
    const [system] = verdictMessages(facts, 'Buy it.');
    expect(system.content).toContain('Rules in code have already decided: BUY');
    expect(system.content).toContain('Start with "Buy"');
  });

  it('keeps a sentence only when it opens with the same verdict', () => {
    expect(acceptVerdictSentence('Buy it: it sells for about 22 dollars.', 'BUY')).toBe('Buy it: it sells for about 22 dollars.');
    expect(acceptVerdictSentence('Pass on this one, it sells too slowly.', 'BUY')).toBeNull();
    expect(acceptVerdictSentence('Buy it... actually, pass.', 'BUY')).toBeNull();
    expect(acceptVerdictSentence('Pass. Only 12 percent sell through.', 'PASS')).toBe('Pass. Only 12 percent sell through.');
    expect(acceptVerdictSentence('You should buy it.', 'PASS')).toBeNull();
    expect(acceptVerdictSentence('Buy it.', 'NEED_PRICE')).toBeNull();
    expect(acceptVerdictSentence(`Buy it. ${'x'.repeat(400)}`, 'BUY')).toBeNull();
  });
});
