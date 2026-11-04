// From the Reskale app: first written 2026-11-04, last changed 2026-11-04 (before this repo). See HACKATHON.md.
/**
 * "Reskale, search in video games category only": which eBay category the
 * seller named. eBay's Taxonomy API suggests leaf categories for the words;
 * the seller may have named the leaf or one of its parents ("video games"
 * vs "video games and consoles"), so every node on each suggested path is a
 * candidate and the one whose name best matches the words wins.
 */

export interface EbayCategory {
  categoryId: string;
  categoryName: string;
}

/** One entry of get_category_suggestions' `categorySuggestions`. */
export interface CategorySuggestion {
  category?: Partial<EbayCategory>;
  /** Deepest first. */
  categoryTreeNodeAncestors?: Partial<EbayCategory>[];
}

/** "Cell Phones & Smartphones" → cell, phone, smartphone: lower case, plurals folded, no "and". */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && w !== 'and')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

/** Share of the said words in the name, plus a bonus for the name being exactly them. */
function match(wanted: string[], name: string[]): number {
  const share = wanted.filter((w) => name.includes(w)).length / Math.max(wanted.length, 1);
  const exact = share === 1 && name.length === wanted.length;
  return share + (exact ? 0.5 : 0);
}

export function bestCategory(said: string, suggestions: CategorySuggestion[]): EbayCategory | null {
  const wanted = words(said);
  let best: EbayCategory | null = null;
  let bestScore = 0;
  for (const suggestion of suggestions) {
    // In eBay's order, leaf before parents: a tie keeps the likelier, narrower one.
    for (const node of [suggestion.category, ...(suggestion.categoryTreeNodeAncestors ?? [])]) {
      if (!node?.categoryId || !node.categoryName) continue;
      const score = match(wanted, words(node.categoryName));
      if (score > bestScore) {
        best = { categoryId: node.categoryId, categoryName: node.categoryName };
        bestScore = score;
      }
    }
  }
  if (best) return best;
  // No name shares a word with what was said: trust eBay's first suggestion.
  const top = suggestions[0]?.category;
  return top?.categoryId && top.categoryName ? { categoryId: top.categoryId, categoryName: top.categoryName } : null;
}
