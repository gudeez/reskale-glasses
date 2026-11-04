// From the Reskale app: first written 2026-11-02, last changed 2026-11-02 (before this repo). See HACKATHON.md.
import { describe, it, expect, vi } from 'vitest';
import {
  actionFor,
  createGestureReader,
  modeAnnouncement,
  photoAnnouncement,
  TRIPLE_WINDOW_MS,
  type Gesture,
  type PressTimer,
} from '@/lib/glasses/hands-free';

const idle = { busy: false, shotMode: 'single' as const, staged: 0 };

describe('actionFor', () => {
  it('press searches the next item; while searching it is never queued', () => {
    expect(actionFor('single', idle)).toBe('capture');
    expect(actionFor('single', { ...idle, busy: true })).toBe('still_searching');
  });

  it('double press ends, or searches the photos taken in multi-shot', () => {
    expect(actionFor('double', idle)).toBe('end');
    expect(actionFor('double', { ...idle, shotMode: 'multi', staged: 0 })).toBe('end');
    expect(actionFor('double', { ...idle, shotMode: 'multi', staged: 2 })).toBe('search_set');
    expect(actionFor('double', { ...idle, busy: true, shotMode: 'multi', staged: 2 })).toBe('end');
  });

  it('hold repeats, even mid-search; triple switches mode when idle', () => {
    expect(actionFor('hold', { ...idle, busy: true })).toBe('repeat');
    expect(actionFor('triple', idle)).toBe('toggle_mode');
    expect(actionFor('triple', { ...idle, busy: true })).toBe('still_searching');
  });
});

/** A timer the test fires by hand. */
function manualTimer() {
  const pending = new Map<number, () => void>();
  let next = 1;
  const timer: PressTimer = {
    set: vi.fn((fn: () => void, ms: number) => {
      expect(ms).toBe(TRIPLE_WINDOW_MS);
      const id = next++;
      pending.set(id, fn);
      return id;
    }),
    clear: vi.fn((id: unknown) => {
      pending.delete(id as number);
    }),
  };
  const fire = () => {
    const fns = [...pending.values()];
    pending.clear();
    fns.forEach((fn) => fn());
  };
  return { timer, fire, pending };
}

describe('createGestureReader', () => {
  it('passes a press and a hold straight through', () => {
    const seen: Gesture[] = [];
    const reader = createGestureReader((g) => seen.push(g), manualTimer().timer);
    reader.press('short');
    reader.press('long');
    expect(seen).toEqual(['single', 'hold']);
  });

  it('holds a double press back, then acts on it after the window', () => {
    const seen: Gesture[] = [];
    const { timer, fire } = manualTimer();
    const reader = createGestureReader((g) => seen.push(g), timer);
    reader.press('double');
    expect(seen).toEqual([]);
    fire();
    expect(seen).toEqual(['double']);
  });

  it('a double press then a press inside the window is a triple, and nothing else', () => {
    const seen: Gesture[] = [];
    const { timer, fire } = manualTimer();
    const reader = createGestureReader((g) => seen.push(g), timer);
    reader.press('double');
    reader.press('short');
    fire();
    expect(seen).toEqual(['triple']);
  });

  it('a hold after a double press lets the double stand', () => {
    const seen: Gesture[] = [];
    const reader = createGestureReader((g) => seen.push(g), manualTimer().timer);
    reader.press('double');
    reader.press('long');
    expect(seen).toEqual(['double', 'hold']);
  });

  it('cancel drops a double press still waiting', () => {
    const seen: Gesture[] = [];
    const { timer, pending } = manualTimer();
    const reader = createGestureReader((g) => seen.push(g), timer);
    reader.press('double');
    reader.cancel();
    expect(pending.size).toBe(0);
    expect(seen).toEqual([]);
  });
});

describe('announcements', () => {
  it('says the mode, and how many staged photos were cleared', () => {
    expect(modeAnnouncement('multi', 0)).toMatch(/^Multi-shot on\./);
    expect(modeAnnouncement('single', 0)).toBe('Single shot on.');
    expect(modeAnnouncement('single', 2)).toBe('Single shot on. 2 photos cleared.');
    expect(modeAnnouncement('single', 1)).toBe('Single shot on. 1 photo cleared.');
  });

  it('counts photos, and says it is searching at the last one', () => {
    expect(photoAnnouncement(2)).toBe('Photo 2.');
    expect(photoAnnouncement(4)).toBe('Photo 4. Searching.');
  });
});
