// Hackathon (Nov 4 2026): the agent's voice phrases.
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../glasses/voice-commands';

describe('"Reskale, should I buy it?"', () => {
  it.each([
    'Reskale, should I buy it',
    'Reskale should I buy this',
    'Reskale, buy or pass?',
    'Reskale, is it worth buying',
    "Reskale, what's the verdict",
  ])('%s asks for the verdict', (said) => {
    expect(parseCommand(said)).toEqual({ kind: 'should_buy' });
  });
});

describe('the price the store wants', () => {
  it.each([
    ["Reskale, it's 5 dollars", 5],
    ['Reskale, it is 12', 12],
    ['Reskale, the tag says 4.99', 4.99],
    ['Reskale, price is 8 dollars', 8],
    ['Reskale, they want 20', 20],
    ['Reskale, paid 3', 3],
  ])('%s is a price of %d', (said, dollars) => {
    expect(parseCommand(said)).toEqual({ kind: 'cost', dollars });
  });

  it('leaves a sentence with no amount alone', () => {
    expect(parseCommand("Reskale, it's broken")).not.toEqual(expect.objectContaining({ kind: 'cost' }));
  });
});

describe('free questions go to Muse', () => {
  it('passes an unrecognised question through, word for word', () => {
    expect(parseCommand('Reskale, who makes this')).toEqual({ kind: 'free_ask', text: 'who makes this' });
    expect(parseCommand('Reskale, is this brand still popular')).toEqual({ kind: 'free_ask', text: 'is this brand still popular' });
  });

  it('keeps the questions it already answers itself', () => {
    expect(parseCommand('Reskale, what does it sell for new')).toEqual({ kind: 'ask', question: 'new_price' });
  });

  it('ignores chatter that isn’t a question', () => {
    expect(parseCommand('Reskale, banana')).toBeNull();
  });
});
