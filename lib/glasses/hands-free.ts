/**
 * Hands-free sourcing: what each press of the glasses button does. Pure apart
 * from the timer it is handed, so it unit-tests in plain Node.
 *
 *   press         single shot: photograph and search the next item
 *                 multi-shot:  add a photo of this item (the 4th searches the set)
 *   double press  multi-shot with photos taken: search them as one item
 *                 otherwise: stop talking and end the search
 *   triple press  switch between single shot and multi-shot
 *   hold          say the last result again (free)
 *
 * Meta's glasses report a short press, a double press and a hold, never a
 * triple. A triple is a double press followed by one more press within
 * TRIPLE_WINDOW_MS, so a double press waits that long before it acts.
 */

import type { ButtonPress } from './types';

export type ShotMode = 'single' | 'multi';

/** The vision route takes at most 4 photos of one item (MAX_SCAN_IMAGES). */
export const MAX_SHOTS = 4;

/** How long a double press waits for a third. */
export const TRIPLE_WINDOW_MS = 500;

export type Gesture = 'single' | 'double' | 'triple' | 'hold';

export type HandsFreeAction =
  /** Take a photo: searched at once in single shot, added to the set in multi-shot. */
  | 'capture'
  /** Search the photos taken so far as one item. */
  | 'search_set'
  /** Stop talking; the search is over. */
  | 'end'
  | 'repeat'
  | 'toggle_mode'
  /** A press while a search is running: never queued, as each would be billed. */
  | 'still_searching';

export interface HandsFreeState {
  busy: boolean;
  shotMode: ShotMode;
  /** Photos taken for the current multi-shot item. */
  staged: number;
}

export function actionFor(gesture: Gesture, { busy, shotMode, staged }: HandsFreeState): HandsFreeAction {
  switch (gesture) {
    case 'hold':
      return 'repeat';
    case 'triple':
      return busy ? 'still_searching' : 'toggle_mode';
    case 'double':
      if (busy) return 'end';
      return shotMode === 'multi' && staged > 0 ? 'search_set' : 'end';
    case 'single':
      return busy ? 'still_searching' : 'capture';
  }
}

export interface PressTimer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimer: PressTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Turns raw button presses into gestures. A double press is held back for
 * TRIPLE_WINDOW_MS; a press inside that window makes it a triple.
 */
export function createGestureReader(onGesture: (gesture: Gesture) => void, timer: PressTimer = realTimer) {
  let pendingDouble: unknown = null;

  const flush = () => {
    pendingDouble = null;
    onGesture('double');
  };

  return {
    press(press: ButtonPress) {
      if (pendingDouble !== null) {
        timer.clear(pendingDouble);
        pendingDouble = null;
        if (press === 'short') {
          onGesture('triple');
          return;
        }
        onGesture('double'); // something else followed: the double stands on its own
      }
      if (press === 'double') pendingDouble = timer.set(flush, TRIPLE_WINDOW_MS);
      else onGesture(press === 'long' ? 'hold' : 'single');
    },
    /** Drop a double press still waiting (the screen is going away). */
    cancel() {
      if (pendingDouble !== null) timer.clear(pendingDouble);
      pendingDouble = null;
    },
  };
}

/** What the glasses say when the mode changes. */
export function modeAnnouncement(mode: ShotMode, discarded: number): string {
  const head = mode === 'multi' ? 'Multi-shot on. Press for each photo, double press to search.' : 'Single shot on.';
  if (discarded <= 0) return head;
  return `${head} ${discarded} ${discarded === 1 ? 'photo' : 'photos'} cleared.`;
}

/** "Photo 2." — and at the last one, that the set is being searched. */
export function photoAnnouncement(staged: number): string {
  return staged >= MAX_SHOTS ? `Photo ${staged}. Searching.` : `Photo ${staged}.`;
}

export const STILL_SEARCHING = 'Still searching.';
export const DONE = 'Done.';
export const INTRO =
  'Press once to search. Double press to stop. Hold to hear it again. Triple press for multi-shot. ' +
  'Or say Reskale, then what you want: scan, cancel, or what does it sell for.';
