import { describe, expect, it } from 'vitest';
import { canCropTo, DEFAULT_BOX, MIN_GLASSES_SIDE, needsQuarterTurn, parseBox } from '../glasses/crop-box';

describe('glasses crop box', () => {
  it('falls back to the default when storage is empty or garbled', () => {
    expect(parseBox(null)).toEqual(DEFAULT_BOX);
    expect(parseBox('not json')).toEqual(DEFAULT_BOX);
    expect(parseBox('{"x":"a"}')).toEqual(DEFAULT_BOX);
  });

  it('reads a saved box back, repaired to fit the frame', () => {
    expect(parseBox('{"x":0.1,"y":0.1,"w":0.5,"h":0.5}')).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
    expect(parseBox('{"x":0.95,"y":0,"w":0.01,"h":0.5}')).toEqual({ x: 1 - MIN_GLASSES_SIDE, y: 0, w: MIN_GLASSES_SIDE, h: 0.5 });
  });

  it('crops only when the photo has the live view’s shape', () => {
    expect(canCropTo({ width: 3024, height: 4032 }, 0.75)).toBe(true);
    // Rotated photo: the box would land on the wrong part, so send it whole.
    expect(canCropTo({ width: 4032, height: 3024 }, 0.75)).toBe(false);
    // No frame seen yet: nothing to line the box up with.
    expect(canCropTo({ width: 3024, height: 4032 }, null)).toBe(false);
  });
});

describe('needsQuarterTurn', () => {
  it('turns the glasses’ landscape photo upright, and leaves a portrait one alone', () => {
    expect(needsQuarterTurn({ width: 1440, height: 1080 })).toBe(true);
    expect(needsQuarterTurn({ width: 1080, height: 1440 })).toBe(false);
    expect(needsQuarterTurn({ width: 1000, height: 1000 })).toBe(false);
  });
});
