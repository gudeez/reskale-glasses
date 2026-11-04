// From the Reskale app: first written 2026-11-02, last changed 2026-11-04 (before this repo). See HACKATHON.md.
import { describe, expect, it } from 'vitest';
import { afterWakeWord, createCommandListener, parseAmount, parseCommand, WAKE_WINDOW_MS } from '../glasses/voice-commands';

describe('the wake word', () => {
  it('ignores anything not said to Reskale', () => {
    expect(parseCommand('scan')).toBeNull();
    expect(parseCommand('next please')).toBeNull();
    expect(parseCommand('can you scan this for me')).toBeNull();
    expect(parseCommand('I bought it for five dollars')).toBeNull();
  });

  it('hears the ways speech recognition spells it', () => {
    for (const said of ['Reskale, scan', 'rescale scan', 'Re scale scan', 'risk ale scan', 'Hey Reskale scan', 're-scale scan', 'Rescaled, scan']) {
      expect(parseCommand(said)).toEqual({ kind: 'scan' });
    }
  });

  it('needs the wake word first, not somewhere in the sentence', () => {
    expect(afterWakeWord('I told reskale to scan')).toBeNull();
  });

  it('does nothing with the wake word alone', () => {
    expect(parseCommand('Reskale')).toBeNull();
  });
});

describe('scan controls', () => {
  it.each([
    ['Reskale, next', { kind: 'scan' }],
    ['Reskale, price this', { kind: 'scan' }],
    ['Reskale, search them', { kind: 'search_set' }],
    ['Reskale, stop', { kind: 'end' }],
    ["Reskale, that's it", { kind: 'end' }],
    ['Reskale, say that again', { kind: 'repeat' }],
    ['Reskale, cancel', { kind: 'cancel' }],
    ['Reskale, never mind', { kind: 'cancel' }],
    ['Reskale, multi-shot', { kind: 'mode', mode: 'multi' }],
    ['Reskale, multi shot', { kind: 'mode', mode: 'multi' }],
    ['Reskale, single shot', { kind: 'mode', mode: 'single' }],
    ['Reskale, yes', { kind: 'yes' }],
    ['Reskale, no', { kind: 'no' }],
  ])('%s', (said, command) => {
    expect(parseCommand(said)).toEqual(command);
  });
});

describe('fixing the search when the item was identified wrong', () => {
  it.each([
    ['Reskale, change search to BraX3 smartphone', 'brax3 smartphone'],
    // Heard on the glasses, 2026-11-04: the recogniser's full stops land mid-sentence.
    ['Rescaled change. Search parameter to bracks. Three smartphone.', 'bracks three smartphone'],
    ['Reskale, change the search to stanley tape measure', 'stanley tape measure'],
    ['Reskale, change it to a nike air max 90', 'a nike air max 90'],
    ['Reskale, search for vintage pyrex bowl', 'vintage pyrex bowl'],
  ])('%s', (said, query) => {
    expect(parseCommand(said)).toEqual({ kind: 'search_for', query });
  });

  it('still scans on a bare "search"', () => {
    expect(parseCommand('Reskale, search')).toEqual({ kind: 'scan' });
  });

  it.each([
    // Heard on the glasses, 2026-11-04.
    ['Rescale change condition to used.', { kind: 'condition', condition: 'good' }],
    ['Reskale, change the condition to new', { kind: 'condition', condition: 'new' }],
    ['Reskale, set condition to for parts', { kind: 'condition', condition: 'for_parts' }],
    ['Reskale, change condition to all', { kind: 'all_conditions' }],
    ['Reskale, condition any', { kind: 'all_conditions' }],
  ])('%s', (said, command) => {
    expect(parseCommand(said)).toEqual(command);
  });
});

describe('searching one category', () => {
  it.each([
    ['Reskale, search in video games category only', 'video games'],
    // Heard on the glasses, 2026-11-04: "only" came out as "online".
    ['Rescale search in video games category online', 'video games'],
    ['Rescale. Search in the cell phones. Category only.', 'cell phones'],
    ['Reskale, search only in cameras', 'cameras'],
    ['Reskale, search the video games category', 'video games'],
  ])('%s', (said, category) => {
    expect(parseCommand(said)).toEqual({ kind: 'search_category', category });
  });

  it('searches every category again', () => {
    expect(parseCommand('Reskale, search all categories')).toEqual({ kind: 'search_category', category: null });
    expect(parseCommand('Reskale, search every category')).toEqual({ kind: 'search_category', category: null });
  });

  it('leaves "search them" and a bare "search" alone', () => {
    expect(parseCommand('Reskale, search them')).toEqual({ kind: 'search_set' });
    expect(parseCommand('Reskale, search all')).toEqual({ kind: 'search_set' });
    expect(parseCommand('Reskale, search')).toEqual({ kind: 'scan' });
  });
});

describe('the profit calculator', () => {
  it.each([
    ['Reskale, calculate minimum list price based on 5 dollars', 5],
    ['Rescale, calculate minimum list price based on $12.50', 12.5],
    ['Reskale, minimum list price for five', 5],
    ['Reskale, what is the min list price if I paid 20', 20],
    ['Reskale, calculate the minimum listing price based on a five dollar buy price', 5],
  ])('%s', (said, dollars) => {
    expect(parseCommand(said)).toEqual({ kind: 'min_list', dollars });
  });

  it.each([
    ['Reskale, calculate cost to purchase at 3 pounds weight', 3],
    ['Reskale, calculate cost to purchase at 3 weight', 3],
    ['Reskale, calculate cost to purchase at 2.5 lbs', 2.5],
    ['Reskale, cost to buy at four pounds', 4],
    ['Reskale, purchase cost at 12 ounces', 0.75],
    ['Reskale, cost to purchase 2 pounds 8 ounces', 2.5],
  ])('%s', (said, pounds) => {
    expect(parseCommand(said)).toEqual({ kind: 'buy_weight', pounds });
  });

  it.each([
    ['Reskale, calculate cost to ship at 2 pounds', 2, null],
    ['Reskale, shipping cost for 1.5 lb', 1.5, null],
    ['Reskale, how much to ship 8 ounces', 0.5, null],
    ['Reskale, calculate cost to ship at 12 by 10 by 6', null, { l: 12, w: 10, h: 6 }],
    ['Reskale, calculate cost to ship at twelve by ten by six dimensions', null, { l: 12, w: 10, h: 6 }],
    ['Reskale, cost to ship 3 pounds 14 x 12 x 10', 3, { l: 14, w: 12, h: 10 }],
    ['Reskale, cost to ship at 18x12x12 and 5 pounds', 5, { l: 18, w: 12, h: 12 }],
  ])('%s', (said, pounds, box) => {
    expect(parseCommand(said)).toEqual({ kind: 'ship_cost', pounds, box });
  });

  // Said freely, with a weight in it. The first was heard on the glasses, 2026-11-04.
  it.each([
    ['Rescale what is the cost of this item if it weighs 8 ounces?', 0.5],
    ['Reskale, price this item by a weight of 8 oz', 0.5],
    ['Reskale, how much does it cost if it weighs 3 pounds', 3],
    ["Reskale, what's the cost at eight ounces", 0.5],
    ['Reskale, bins price for two pounds', 2],
    ['Reskale, how much is 1 pound 4 ounces', 1.25],
  ])('%s', (said, pounds) => {
    expect(parseCommand(said)).toEqual({ kind: 'buy_weight', pounds });
  });

  it('hears a freely worded shipping question with a weight or a box', () => {
    expect(parseCommand('Reskale, what does it cost to ship 8 ounces')).toEqual({ kind: 'ship_cost', pounds: 0.5, box: null });
    expect(parseCommand('Reskale, what would postage be for a 12 by 10 by 6 box')).toEqual({
      kind: 'ship_cost',
      pounds: null,
      box: { l: 12, w: 10, h: 6 },
    });
  });

  it('never takes a weight question for a scan, a price paid or a note', () => {
    expect(parseCommand('Reskale, price this')).toEqual({ kind: 'scan' });
    expect(parseCommand('Reskale, paid 5 dollars')).toEqual({ kind: 'cost', dollars: 5 });
    expect(parseCommand('Reskale, note weighs about 2 pounds')).toEqual({ kind: 'note', text: 'weighs about 2 pounds' });
  });

  it('asks for the number rather than guess one', () => {
    expect(parseCommand('Reskale, calculate minimum list price based on a lot')).toEqual({ kind: 'min_list', dollars: null });
    expect(parseCommand('Reskale, cost to purchase at some weight')).toEqual({ kind: 'buy_weight', pounds: null });
    expect(parseCommand('Reskale, cost to ship a box')).toEqual({ kind: 'ship_cost', pounds: null, box: null });
  });
});

describe('questions', () => {
  it.each([
    ['Reskale, what does it sell for new?', 'new_price'],
    ['Reskale, what are used ones worth', 'used_price'],
    ['Reskale, how many sold', 'sold_count'],
    ['Reskale, how many are listed', 'listed_count'],
    ['Reskale, what is the sell-through', 'sell_through'],
    ['Reskale, sell through', 'sell_through'],
    // Heard on the glasses, 2026-11-03: the recogniser's spelling of "sell-through".
    ['Rescale. Tell me the celter rate of that item that I just scanned.', 'sell_through'],
    ['Reskale, what is the sell thru rate', 'sell_through'],
    ['Rescale so through rate.', 'sell_through'],
    ['Reskale, sale through', 'sell_through'],
    ['Reskale, how fast does it sell', 'sell_through'],
    ['Reskale, how much is it worth', 'price'],
    ['Reskale, what is it', 'identity'],
    // Heard on the glasses, 2026-11-04: "sell" comes out as "cell".
    ["Rescale what's its cell for?", 'price'],
    ['Reskale, what does it cell for new', 'new_price'],
    ['Reskale, what do used ones cell for', 'used_price'],
    ['Reskale, cell through rate', 'sell_through'],
    ['Reskale, how fast does it cell', 'sell_through'],
    ["Rescale what's the selter raid", 'sell_through'],
    ['Reskale, what is this cell phone', 'identity'],
  ])('%s', (said, question) => {
    expect(parseCommand(said)).toEqual({ kind: 'ask', question });
  });

  it('keeps "cell" in search words and notes', () => {
    expect(parseCommand('Reskale, search in cell phones category only')).toEqual({ kind: 'search_category', category: 'cell phones' });
    expect(parseCommand('Reskale, note battery cell is dead')).toEqual({ kind: 'note', text: 'battery cell is dead' });
  });

  it('hears "minimum cell price" as the calculator', () => {
    expect(parseCommand('Reskale, minimum cell price based on 5 dollars')).toEqual({ kind: 'min_list', dollars: 5 });
  });

  it('ignores what it does not understand', () => {
    expect(parseCommand('Reskale, order me a pizza')).toBeNull();
  });
});

describe('listing details', () => {
  it.each([
    ['Reskale, bought for five', 5],
    ['Reskale, bought it for five dollars', 5],
    ['Reskale, paid $5.50', 5.5],
    ['Reskale, paid 12', 12],
    ['Reskale, cost was two fifty', 2.5],
    ['Reskale, paid twenty five dollars', 25],
    ['Reskale, paid twelve ninety nine', 12.99],
    ['Reskale, paid one hundred twenty', 120],
    ['Reskale, paid a hundred', 100],
    ['Reskale, paid five dollars and fifty cents', 5.5],
  ])('%s', (said, dollars) => {
    expect(parseCommand(said)).toEqual({ kind: 'cost', dollars });
  });

  it('drops a price it cannot read rather than guess', () => {
    expect(parseCommand('Reskale, paid a lot')).toBeNull();
  });

  it.each([
    ['Reskale, condition like new', 'like_new'],
    ['Reskale, condition new', 'new'],
    ['Reskale, condition is good', 'good'],
    ['Reskale, condition fair', 'fair'],
    ['Reskale, condition for parts', 'for_parts'],
  ])('%s', (said, condition) => {
    expect(parseCommand(said)).toEqual({ kind: 'condition', condition });
  });

  it('takes a note in the seller’s words', () => {
    expect(parseCommand('Reskale, note missing the lid')).toEqual({ kind: 'note', text: 'missing the lid' });
    expect(parseCommand('Reskale, add a note small scratch on top')).toEqual({ kind: 'note', text: 'small scratch on top' });
  });
});

describe('parseAmount', () => {
  it('reads digits and words', () => {
    expect(parseAmount('7')).toBe(7);
    expect(parseAmount('$0.99')).toBe(0.99);
    expect(parseAmount('seven')).toBe(7);
    expect(parseAmount('forty')).toBe(40);
    expect(parseAmount('one two three')).toBeNull();
  });
});

describe('a pause after the wake word', () => {
  function listen() {
    let clock = 0;
    const heard: unknown[] = [];
    const hear = createCommandListener((command) => heard.push(command), () => clock);
    return { hear, heard, wait: (ms: number) => (clock += ms) };
  }

  it('takes the next phrase as the command', () => {
    const { hear, heard } = listen();
    hear('Reskale.');
    hear('What does it sell for new?');
    expect(heard).toEqual([{ kind: 'ask', question: 'new_price' }]);
  });

  it('still takes a whole phrase', () => {
    const { hear, heard } = listen();
    hear('Reskale, scan');
    expect(heard).toEqual([{ kind: 'scan' }]);
  });

  it('ignores the next phrase once the window has passed', () => {
    const { hear, heard, wait } = listen();
    hear('Reskale');
    wait(WAKE_WINDOW_MS + 1);
    hear('scan');
    expect(heard).toEqual([]);
  });

  it('only lets one phrase through', () => {
    const { hear, heard } = listen();
    hear('Reskale');
    hear('scan');
    hear('scan');
    expect(heard).toEqual([{ kind: 'scan' }]);
  });

  it('ignores a bare scan with no wake word at all', () => {
    const { hear, heard } = listen();
    hear('scan');
    expect(heard).toEqual([]);
  });
});
