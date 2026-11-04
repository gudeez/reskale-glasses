// From the Reskale app: first written 2026-11-02, last changed 2026-11-04 (before this repo); changed here on 2026-11-04 for the hackathon. See HACKATHON.md.
/**
 * What a seller can say to the glasses. Pure, so it unit-tests in plain Node.
 *
 * Every command starts with the wake word: "Reskale, scan". A store is loud
 * and a bare "scan" or "next" from someone nearby must never spend a paid
 * lookup, so anything without the wake word is ignored. Speech recognition
 * spells the name several ways ("rescale", "re scale", "risk ale"); all count.
 */

import type { BoxSize } from '../shipping/usps-estimate';
import type { ShotMode } from './hands-free';

export type SpokenCondition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts';

export type Question = 'identity' | 'price' | 'new_price' | 'used_price' | 'sold_count' | 'listed_count' | 'sell_through';

export type VoiceCommand =
  /** The same as a press: photograph and search (or add a photo in multi-shot). */
  | { kind: 'scan' }
  /** Search the multi-shot photos as one item. */
  | { kind: 'search_set' }
  /** Stop talking; the search is over. */
  | { kind: 'end' }
  | { kind: 'repeat' }
  /** Abandon the search that's running. */
  | { kind: 'cancel' }
  | { kind: 'mode'; mode: ShotMode }
  | { kind: 'yes' }
  | { kind: 'no' }
  /** Answered from the last result; never a new lookup. */
  | { kind: 'ask'; question: Question }
  /** Hackathon: the buy/pass agent's verdict on the last scan. */
  | { kind: 'should_buy' }
  /** Hackathon: any other question, answered by Muse from the last result only. */
  | { kind: 'free_ask'; text: string }
  /** What the seller paid, in dollars. */
  | { kind: 'cost'; dollars: number }
  | { kind: 'condition'; condition: SpokenCondition }
  /** Show listings in every condition again. */
  | { kind: 'all_conditions' }
  | { kind: 'note'; text: string }
  /** Search these words instead: the item was identified wrong. */
  | { kind: 'search_for'; query: string }
  /** Search the same words in one eBay category, as named; null is every category again. */
  | { kind: 'search_category'; category: string | null }
  /** The profit calculator. A number it couldn't make out is null, and the seller is asked again. */
  | { kind: 'min_list'; dollars: number | null }
  | { kind: 'buy_weight'; pounds: number | null }
  | { kind: 'ship_cost'; pounds: number | null; box: BoxSize | null };

const WAKE = /^(?:(?:hey|ok|okay|um|uh)\s+)?(?:re[\s-]?s[ck]ale|risk\s?ale|rescale)d?\b[\s,.!]*/;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$.\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words after the wake word, or null when the phrase wasn't for Reskale. */
export function afterWakeWord(text: string): string | null {
  const said = normalise(text);
  const match = WAKE.exec(said);
  if (!match) return null;
  return said.slice(match[0].length).replace(/[.!]+$/, '').trim();
}

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const FILLER = new Set(['dollars', 'dollar', 'bucks', 'buck', 'and', 'cents', 'cent', 'about', 'like', 'just']);

/**
 * Number words into groups: "twenty five" is one group (25), "two fifty" two
 * (2, 50). Hundreds fold into the group they lead.
 */
function wordGroups(words: string[]): number[] | null {
  const groups: number[] = [];
  let current: number | null = null;
  let lastWasTens = false;
  for (const word of words) {
    if (FILLER.has(word)) {
      if (current !== null) groups.push(current);
      current = null;
      lastWasTens = false;
      continue;
    }
    if (word === 'hundred') {
      current = (current ?? 1) * 100;
      lastWasTens = false;
      continue;
    }
    const unit = UNITS[word];
    const tens = TENS[word];
    if (unit === undefined && tens === undefined) return null;
    if (unit !== undefined && unit < 10 && lastWasTens && current !== null) {
      current += unit; // "twenty" + "five"
      lastWasTens = false;
      continue;
    }
    if (current !== null && current % 100 === 0 && current >= 100) {
      current += unit ?? tens; // "one hundred" + "twenty"
      lastWasTens = tens !== undefined;
      continue;
    }
    if (current !== null) groups.push(current);
    current = unit ?? tens;
    lastWasTens = tens !== undefined;
  }
  if (current !== null) groups.push(current);
  return groups.length > 0 ? groups : null;
}

/** "5", "$5.50", "five dollars", "two fifty", "twelve ninety nine" → dollars. */
export function parseAmount(spoken: string): number | null {
  const text = spoken.trim();
  const digits = /^\$?\s?(\d+(?:\.\d{1,2})?)\b/.exec(text);
  if (digits) return Number(digits[1]);

  const groups = wordGroups(text.split(' ').filter(Boolean));
  if (!groups) return null;
  if (groups.length === 1) return groups[0];
  if (groups.length === 2 && groups[1] < 100) return groups[0] + groups[1] / 100;
  return null;
}

/** The amount at the start: "a five dollar buy price" → 5. */
function leadingAmount(spoken: string): number | null {
  const words = spoken.replace(/^(?:a|an|my|the) /, '').split(' ').filter(Boolean);
  for (let end = words.length; end > 0; end--) {
    const amount = parseAmount(words.slice(0, end).join(' '));
    if (amount !== null) return amount;
  }
  return null;
}

/** Runs of number words as digits: "twelve by ten" → "12 by 10". A lone "a" or "oh" stays a word. */
function wordsAsDigits(text: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const groups = run.every((w) => w === 'a' || w === 'oh') ? null : wordGroups(run);
    if (groups?.length === 1) out.push(String(groups[0]));
    else out.push(...run);
    run = [];
  };
  for (const word of text.split(' ')) {
    if (word in UNITS || word in TENS || word === 'hundred') {
      run.push(word);
    } else {
      flush();
      out.push(word);
    }
  }
  flush();
  return out
    .join(' ')
    .replace(/(\d+) point (\d+)/g, '$1.$2')
    .replace(/(\d+) and a half\b/g, (_, n: string) => String(Number(n) + 0.5));
}

const BOX = /(\d+(?:\.\d+)?) ?(?:by|x) ?(\d+(?:\.\d+)?) ?(?:by|x) ?(\d+(?:\.\d+)?)/;

/** "3 pounds", "2 pounds 8 ounces", "12 oz", or a bare "3" as pounds. */
function parseWeight(text: string): number | null {
  const pounds = /(\d+(?:\.\d+)?) ?(?:pounds?|lbs?)\b/.exec(text);
  const ounces = /(\d+(?:\.\d+)?) ?(?:ounces?|oz)\b/.exec(text);
  if (pounds || ounces) return (pounds ? Number(pounds[1]) : 0) + (ounces ? Number(ounces[1]) / 16 : 0);
  const bare = /^(?:at |for )?(\d+(?:\.\d+)?)\b/.exec(text.trim());
  return bare ? Number(bare[1]) : null;
}

/** "3 pounds 14 x 12 x 10", "12 by 10 by 6", "2 pounds". */
function parseParcel(spoken: string): { pounds: number | null; box: BoxSize | null } {
  const text = wordsAsDigits(spoken);
  const box = BOX.exec(text);
  return {
    pounds: parseWeight(box ? text.replace(box[0], ' ') : text),
    box: box ? { l: Number(box[1]), w: Number(box[2]), h: Number(box[3]) } : null,
  };
}

/** A weight with its unit, in text already through wordsAsDigits. */
const WEIGHT_SAID = /\d ?(?:pounds?|lbs?|ounces?|oz)\b/;

/**
 * The calculator worded freely: "what is the cost of this item if it weighs
 * 8 ounces?", "what does it cost to ship 8 ounces". Needs a weight (or, for
 * shipping, a box) so a plain "what's it worth" stays a market question.
 */
function byWeight(flat: string): VoiceCommand | null {
  const text = wordsAsDigits(flat);
  const weight = WEIGHT_SAID.test(text);
  if (/\b(?:ship(?:ping)?|mail(?:ing)?|postage)\b/.test(text)) {
    return weight || BOX.test(text) ? { kind: 'ship_cost', ...parseParcel(flat) } : null;
  }
  if (weight && /\b(?:cost|price|weigh(?:s|ing)?|bins?|how much)\b/.test(text)) {
    return { kind: 'buy_weight', pounds: parseWeight(text) };
  }
  return null;
}

const CALC = "(?:calculate |work out |what(?:'s| is) |tell me )?(?:the |my )?";
const MIN_LIST = new RegExp(
  `^${CALC}(?:minimum|min) (?:list(?:ing)? |sell(?:ing)? )?price\\b ?(?:(?:based )?on|for|at|from|with|if i (?:paid|bought it for))? ?(.*)$`,
);
const BUY_WEIGHT = new RegExp(
  `^${CALC}(?:(?:cost|price) to (?:purchase|buy)(?: it| this)?|(?:purchase|buying|buy) (?:cost|price))\\b ?(?:at|for|of)? ?(.*)$`,
);
const SHIP_COST = new RegExp(
  `^${CALC}(?:(?:cost|price) to (?:ship|mail|post)(?: it| this)?|shipping(?: cost| price)?|how much (?:is it |does it cost )?to ship(?: it| this)?)\\b ?(?:at|for|of|with)? ?(.*)$`,
);

/**
 * The recogniser hears "sell" as "cell": "what's its cell for?". Only for
 * questions and the calculator — search words and notes keep "cell", and
 * "cell phone" is left alone everywhere.
 */
function sellNotCell(said: string): string {
  return said.replace(/\bcell(?!\s?phones?\b)/g, 'sell');
}

const CONDITIONS: [RegExp, SpokenCondition][] = [
  [/^like new\b/, 'like_new'],
  [/^(?:brand )?new\b/, 'new'],
  [/^(?:good|very good|used)\b/, 'good'],
  [/^(?:fair|acceptable|worn)\b/, 'fair'],
  [/^(?:for )?parts\b|^broken\b/, 'for_parts'],
];

function parseQuestion(said: string): Question | null {
  // Speech recognition writes "sell-through" as "celter", "so through" or "sell thru" too.
  if (/(?:sell|sale|sel|cel|so)[\s-]?(?:through|thru|ter)\b|(?:through|thru) rate|\bstr\b|how (?:fast|quick(?:ly)?) (?:does |do |will )?(?:it |they |this )?sell/.test(said)) {
    return 'sell_through';
  }
  if (/how many (?:have )?sold|sold count|number sold/.test(said)) return 'sold_count';
  if (/how many (?:are )?(?:listed|for sale|active)|listed count/.test(said)) return 'listed_count';
  const asksPrice = /price|sell|worth|go for|how much/.test(said);
  if (asksPrice && /\bnew\b/.test(said)) return 'new_price';
  if (asksPrice && /\bused\b/.test(said)) return 'used_price';
  if (asksPrice) return 'price';
  if (/what(?:'s| is) (?:it|this|that)|what am i looking at/.test(said)) return 'identity';
  return null;
}

export function parseCommand(text: string): VoiceCommand | null {
  const said = afterWakeWord(text);
  if (said === null || said === '') return null;

  if (/^(?:cancel|never ?mind|abort|forget it)\b/.test(said)) return { kind: 'cancel' };

  // The recogniser puts full stops where the seller paused: "change. search to …".
  const flat = said.replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^search (?:in )?(?:all|every|any) (?:the )?categor(?:y|ies)\b/.test(flat)) return { kind: 'search_category', category: null };
  if (/^search (?:them|these|the set|all)\b/.test(said)) return { kind: 'search_set' };
  // "Only" is often heard as "online".
  const category =
    /^search (?:only )?(?:in|within|under) (?:the )?(.+?)(?: categor(?:y|ies))?(?: only| online)?$/.exec(flat) ??
    /^search (?:only )?the (.+?) categor(?:y|ies)(?: only| online)?$/.exec(flat);
  if (category) return { kind: 'search_category', category: category[1] };

  const search =
    /^(?:(?:change|set|switch) (?:the )?(?:search|title|name|it)(?: (?:term|terms|words|parameter|query))? to|search for) (.+)$/.exec(flat);
  if (search) return { kind: 'search_for', query: search[1] };

  if (/^multi[\s-]?shot\b/.test(said)) return { kind: 'mode', mode: 'multi' };
  if (/^single(?:[\s-]?shot)?\b/.test(said)) return { kind: 'mode', mode: 'single' };
  // "Price this item at 8 ounces" is the calculator, never a billed scan.
  if (/^(?:scan|next|search|price (?:this|it)|look (?:this )?up)\b/.test(said) && !WEIGHT_SAID.test(wordsAsDigits(flat))) {
    return { kind: 'scan' };
  }
  if (/^(?:stop|done|end|that's it|that is it)\b/.test(said)) return { kind: 'end' };
  if (/^(?:repeat|again|say (?:that|it) again|what did you say)\b/.test(said)) return { kind: 'repeat' };
  if (/^(?:yes|yeah|yep|confirm|do it)\b/.test(said)) return { kind: 'yes' };
  if (/^(?:no|nope|don't)\b/.test(said)) return { kind: 'no' };

  // Before "cost …": "cost to ship" is a calculation, not a price paid.
  const minList = MIN_LIST.exec(sellNotCell(flat));
  if (minList) return { kind: 'min_list', dollars: leadingAmount(minList[1]) };
  const buyWeight = BUY_WEIGHT.exec(flat);
  if (buyWeight) return { kind: 'buy_weight', pounds: parseWeight(wordsAsDigits(buyWeight[1])) };
  const shipCost = SHIP_COST.exec(flat);
  if (shipCost) return { kind: 'ship_cost', ...parseParcel(shipCost[1]) };

  if (SHOULD_BUY.test(sellNotCell(said))) return { kind: 'should_buy' };

  const cost = /^(?:i )?(?:bought (?:it |this )?for|paid|cost(?: is| was)?|it's|it is|(?:the )?(?:price|tag) (?:is|says)|they want)\s+(.+)$/.exec(said);
  if (cost) {
    const dollars = parseAmount(cost[1]);
    // No amount: "cost of this item if it weighs 8 ounces" is a weight question, below.
    if (dollars !== null) return { kind: 'cost', dollars };
  }

  const condition = /^(?:(?:change|set|switch) (?:the )?)?condition(?: is| to)?\s+(.+)$/.exec(flat);
  if (condition) {
    if (/^(?:all|any|both|every(?:thing)?)\b/.test(condition[1])) return { kind: 'all_conditions' };
    const hit = CONDITIONS.find(([pattern]) => pattern.test(condition[1]));
    return hit ? { kind: 'condition', condition: hit[1] } : null;
  }

  const note = /^(?:add (?:a )?)?note\s+(.+)$/.exec(said);
  if (note) return { kind: 'note', text: note[1] };

  const weighed = byWeight(flat);
  if (weighed) return weighed;

  const question = parseQuestion(sellNotCell(said));
  if (question) return { kind: 'ask', question };
  return FREE_QUESTION.test(said) ? { kind: 'free_ask', text: sellNotCell(said) } : null;
}

/** "Should I buy it?", "buy or pass?", "is it worth buying?" */
const SHOULD_BUY = /^(?:should i (?:buy|get|grab|take) (?:it|this|that)|buy (?:it )?or pass|is (?:it|this) worth (?:buying|it|getting)|(?:what's|what is) the verdict)\b/;

/** A question Muse can try: one that starts like a question. */
const FREE_QUESTION = /^(?:what|what's|how|how's|is|are|does|do|can|could|should|which|why|who|when|where|will|would|tell me)\b/;

/** How long a bare "Reskale" waits for the rest of the command. */
export const WAKE_WINDOW_MS = 6000;

/**
 * Turns finished phrases into commands. Speech recognition often ends a
 * phrase at the pause after "Reskale,", so the command arrives on its own:
 * "Reskale." then "What does it sell for new?". A bare wake word therefore
 * opens a short window in which the next phrase counts as said after it.
 */
export function createCommandListener(onCommand: (command: VoiceCommand) => void, now: () => number = Date.now) {
  let wokeAt: number | null = null;
  return (text: string) => {
    const rest = afterWakeWord(text);
    if (rest === '') {
      wokeAt = now();
      return;
    }
    const awake = rest === null && wokeAt !== null && now() - wokeAt <= WAKE_WINDOW_MS;
    wokeAt = null;
    const command = rest !== null ? parseCommand(text) : awake ? parseCommand(`reskale ${text}`) : null;
    if (command) onCommand(command);
  };
}
