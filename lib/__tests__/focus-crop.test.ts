// From the Reskale app: first written 2026-10-20, last changed 2026-10-20 (before this repo). See HACKATHON.md.
import { describe, expect, it } from 'vitest';
import {
  MIN_SIDE,
  boxKey,
  clampBox,
  containRect,
  initialBox,
  isWholePhoto,
  moveBox,
  resizeBox,
  sameAspect,
  snapToObject,
  toPhotoDelta,
  toPixelCrop,
  toScreenRect,
  type FocusBox,
} from '@/lib/focus-crop';

const BOX: FocusBox = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

const expectBox = (got: FocusBox, want: FocusBox) => {
  expect(got.x).toBeCloseTo(want.x);
  expect(got.y).toBeCloseTo(want.y);
  expect(got.w).toBeCloseTo(want.w);
  expect(got.h).toBeCloseTo(want.h);
};

describe('containRect', () => {
  it('letterboxes a portrait photo top and bottom in a wide view', () => {
    // 3:4 photo in a 400×300 view → scaled to 225×300, centred horizontally.
    expect(containRect({ width: 400, height: 300 }, { width: 1536, height: 2048 })).toEqual({
      x: 87.5,
      y: 0,
      width: 225,
      height: 300,
    });
  });

  it('letterboxes a landscape photo above and below in a tall view', () => {
    const r = containRect({ width: 360, height: 640 }, { width: 2048, height: 1536 });
    expect(r.width).toBeCloseTo(360);
    expect(r.height).toBeCloseTo(270);
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(185);
  });

  it('is empty until both sizes are known', () => {
    expect(containRect({ width: 0, height: 0 }, { width: 100, height: 100 }).width).toBe(0);
    expect(containRect({ width: 100, height: 100 }, { width: 0, height: 0 }).width).toBe(0);
  });
});

describe('moveBox', () => {
  it('moves without resizing', () => {
    expectBox(moveBox(BOX, 0.1, -0.05), { x: 0.3, y: 0.15, w: 0.4, h: 0.4 });
  });

  it('stops at the edge of the photo', () => {
    expectBox(moveBox(BOX, 5, -5), { x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });
});

describe('resizeBox', () => {
  it('drags the bottom-right corner out while the top-left stays put', () => {
    expectBox(resizeBox(BOX, 'br', 0.1, 0.2), { x: 0.2, y: 0.2, w: 0.5, h: 0.6 });
  });

  it('drags the top-left corner in while the bottom-right stays put', () => {
    expectBox(resizeBox(BOX, 'tl', 0.1, 0.1), { x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
  });

  it('handles the other two corners on the right axes', () => {
    expectBox(resizeBox(BOX, 'tr', 0.1, -0.1), { x: 0.2, y: 0.1, w: 0.5, h: 0.5 });
    expectBox(resizeBox(BOX, 'bl', -0.1, 0.1), { x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  });

  it('never flips or shrinks below the minimum when a corner crosses its partner', () => {
    const b = resizeBox(BOX, 'tl', 0.9, 0.9);
    expect(b.w).toBeCloseTo(MIN_SIDE);
    expect(b.h).toBeCloseTo(MIN_SIDE);
    expect(b.x + b.w).toBeCloseTo(0.6);
  });

  it('stops a corner at the edge of the photo', () => {
    expectBox(resizeBox(BOX, 'br', 2, 2), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
    expectBox(resizeBox(BOX, 'tl', -2, -2), { x: 0, y: 0, w: 0.6, h: 0.6 });
  });
});

describe('clampBox', () => {
  it('pulls a box back onto the photo and up to the minimum size', () => {
    expectBox(clampBox({ x: 0.95, y: -0.2, w: 0.01, h: 0.3 }), { x: 0.9, y: 0, w: MIN_SIDE, h: 0.3 });
  });
});

describe('screen ↔ photo', () => {
  const drawn = { x: 87.5, y: 0, width: 225, height: 300 };

  it('turns a drag in points into photo fractions of the drawn photo', () => {
    const d = toPhotoDelta(22.5, -30, drawn);
    expect(d.dx).toBeCloseTo(0.1);
    expect(d.dy).toBeCloseTo(-0.1);
  });

  it('draws a box over the photo, not over the letterbox', () => {
    expect(toScreenRect({ x: 0, y: 0, w: 1, h: 1 }, drawn)).toEqual(drawn);
    expect(toScreenRect({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, drawn)).toEqual({ x: 200, y: 150, width: 112.5, height: 150 });
  });

  it('ignores drags before the photo has been measured', () => {
    expect(toPhotoDelta(10, 10, { x: 0, y: 0, width: 0, height: 0 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('snapping and the starting box', () => {
  const shoe = { name: 'Shoe', score: 0.9, box: { x: 0.3, y: 0.3, w: 0.3, h: 0.2 } };

  it('snaps to a detected item with a small margin', () => {
    expectBox(snapToObject(shoe), { x: 0.27, y: 0.27, w: 0.36, h: 0.26 });
  });

  it('keeps a snapped box on the photo when the item touches the edge', () => {
    const b = snapToObject({ name: 'Bag', score: 0.5, box: { x: 0, y: 0.8, w: 0.5, h: 0.2 } });
    expect(b.x).toBe(0);
    expect(b.y + b.h).toBeCloseTo(1);
  });

  it('starts around the most confident item, or the middle with none', () => {
    expectBox(initialBox([shoe]), snapToObject(shoe));
    expectBox(initialBox([]), { x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
    expectBox(initialBox(undefined), { x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
  });
});

describe('isWholePhoto', () => {
  it('treats a box at (or a hair inside) the photo edges as the whole photo', () => {
    expect(isWholePhoto({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isWholePhoto({ x: 0.01, y: 0.02, w: 0.97, h: 0.96 })).toBe(true);
  });

  it('treats anything tighter as a new search', () => {
    expect(isWholePhoto(BOX)).toBe(false);
    expect(isWholePhoto({ x: 0, y: 0, w: 1, h: 0.8 })).toBe(false);
  });
});

describe('boxKey', () => {
  it('gives a box nudged by a pixel the same key, so it reuses the paid result', () => {
    expect(boxKey({ x: 0.2001, y: 0.2, w: 0.4, h: 0.3999 })).toBe(boxKey({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }));
  });

  it('gives a box that really moved a new key', () => {
    expect(boxKey(moveBox(BOX, 0.05, 0))).not.toBe(boxKey(BOX));
  });
});

describe('toPixelCrop', () => {
  it('maps fractions onto whole pixels of the full-size photo', () => {
    expect(toPixelCrop({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, { width: 4000, height: 3000 })).toEqual({
      originX: 1000,
      originY: 1500,
      width: 2000,
      height: 750,
    });
  });

  it('never reaches past the right or bottom edge', () => {
    const c = toPixelCrop({ x: 0.6667, y: 0.6667, w: 0.3333, h: 0.3334 }, { width: 1001, height: 999 });
    expect(c.originX + c.width).toBeLessThanOrEqual(1001);
    expect(c.originY + c.height).toBeLessThanOrEqual(999);
  });

  it('is at least one pixel even for a degenerate box', () => {
    const c = toPixelCrop({ x: 1, y: 1, w: 0, h: 0 }, { width: 100, height: 100 });
    expect(c.width).toBeGreaterThanOrEqual(1);
    expect(c.height).toBeGreaterThanOrEqual(1);
  });
});

describe('sameAspect', () => {
  it('matches a full-size capture to its downscaled copy', () => {
    expect(sameAspect({ width: 3024, height: 4032 }, { width: 1152, height: 1536 })).toBe(true);
  });

  it('refuses a capture that came out rotated', () => {
    expect(sameAspect({ width: 4032, height: 3024 }, { width: 1152, height: 1536 })).toBe(false);
  });

  it('refuses unknown sizes', () => {
    expect(sameAspect({ width: 0, height: 0 }, { width: 1152, height: 1536 })).toBe(false);
  });
});
