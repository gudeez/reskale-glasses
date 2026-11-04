// From the Reskale app: first written 2026-11-04, last changed 2026-11-04 (before this repo). See HACKATHON.md.
import { describe, expect, it } from 'vitest';
import { bestCategory, type CategorySuggestion } from '../ebay-category-match';

// The Taxonomy API's get_category_suggestions shape, as rescale-web-app reads
// it (src/app/api/crosspost/ebay/categories/route.ts): ancestors deepest-first.
const VIDEO_GAMES: CategorySuggestion = {
  category: { categoryId: '139973', categoryName: 'Video Games' },
  categoryTreeNodeAncestors: [{ categoryId: '1249', categoryName: 'Video Games & Consoles' }],
};
const CELL_PHONES: CategorySuggestion = {
  category: { categoryId: '9355', categoryName: 'Cell Phones & Smartphones' },
  categoryTreeNodeAncestors: [{ categoryId: '15032', categoryName: 'Cell Phones & Accessories' }],
};
const CASES: CategorySuggestion = {
  category: { categoryId: '20349', categoryName: 'Cases, Covers & Skins' },
  categoryTreeNodeAncestors: [
    { categoryId: '9394', categoryName: 'Cell Phone Accessories' },
    { categoryId: '15032', categoryName: 'Cell Phones & Accessories' },
  ],
};

describe('bestCategory', () => {
  it('takes the category named exactly', () => {
    expect(bestCategory('video games', [VIDEO_GAMES])).toEqual({ categoryId: '139973', categoryName: 'Video Games' });
  });

  it('can pick a parent when that is what was said', () => {
    expect(bestCategory('video games and consoles', [VIDEO_GAMES])).toEqual({
      categoryId: '1249',
      categoryName: 'Video Games & Consoles',
    });
  });

  it('hears singular and plural alike', () => {
    expect(bestCategory('cell phone', [CELL_PHONES, CASES])?.categoryId).toBe('9355');
  });

  it('prefers the narrower of two equally good names', () => {
    // "Cell Phones & Smartphones" and "Cell Phones & Accessories" both have every word.
    expect(bestCategory('cell phones', [CELL_PHONES, CASES])?.categoryId).toBe('9355');
  });

  it('falls back to eBay’s top suggestion when no name has the words', () => {
    expect(bestCategory('nintendo stuff', [VIDEO_GAMES, CELL_PHONES])?.categoryId).toBe('139973');
  });

  it('is null with no suggestions', () => {
    expect(bestCategory('video games', [])).toBeNull();
  });
});
