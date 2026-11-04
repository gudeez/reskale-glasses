/**
 * Geometry for the "pick the item" box on a scan photo (ENG-176).
 *
 * Every box here is in 0–1 fractions of the PHOTO, never of the screen. That is
 * the lesson of the live-viewfinder crop reverted in a3d20e88 (2026-07-31): it
 * mapped a box drawn on the camera preview onto the capture, and the preview's
 * scale mode, its measured bounds and the capture's EXIF orientation never
 * agreed on Android. Here the editor draws the same image it crops, measures
 * where `resizeMode="contain"` put it (containRect), and converts drags into
 * photo fractions — so the only mapping left is fraction → pixel at crop time.
 *
 * Pure: no React Native, so all of it is unit-tested.
 */

import type { DetectedObject, FocusBox } from '@/lib/scan-objects';

export type { FocusBox } from '@/lib/scan-objects';

export interface Size {
  width: number;
  height: number;
}

/** A rectangle in screen points (layout units), top-left origin. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export const WHOLE_PHOTO: FocusBox = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Smallest box side, as a fraction of the photo. Below this a crop from a
 * ~1500 px photo is barely 100 px across — too little for the model to read.
 */
export const MIN_SIDE = 0.1;

/** Breathing room around a detected item, so the snapped box doesn't clip it. */
const SNAP_PAD = 0.03;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Where an image drawn with `resizeMode="contain"` actually lands inside its
 * view: scaled to fit, centred, letterboxed on the other axis.
 */
export function containRect(view: Size, image: Size): Rect {
  if (!(view.width > 0) || !(view.height > 0) || !(image.width > 0) || !(image.height > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(view.width / image.width, view.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

/** A box inside the photo and at least MIN_SIDE on each side. */
export function clampBox(box: FocusBox, min = MIN_SIDE): FocusBox {
  const w = clamp(box.w, min, 1);
  const h = clamp(box.h, min, 1);
  return { x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h), w, h };
}

/** Drag the whole box by (dx, dy) photo fractions; it keeps its size and stays on the photo. */
export function moveBox(start: FocusBox, dx: number, dy: number): FocusBox {
  return clampBox({ ...start, x: start.x + dx, y: start.y + dy });
}

/**
 * Drag one corner by (dx, dy) photo fractions. The opposite corner stays put,
 * the dragged one stops at the photo's edge, and the box never shrinks below
 * MIN_SIDE — a corner can't be dragged past its partner and flip the box.
 */
export function resizeBox(start: FocusBox, corner: Corner, dx: number, dy: number, min = MIN_SIDE): FocusBox {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (corner === 'tl' || corner === 'bl') left = clamp(left + dx, 0, right - min);
  else right = clamp(right + dx, left + min, 1);

  if (corner === 'tl' || corner === 'tr') top = clamp(top + dy, 0, bottom - min);
  else bottom = clamp(bottom + dy, top + min, 1);

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** A screen-point drag → photo fractions, given where the photo is drawn. */
export function toPhotoDelta(dxPoints: number, dyPoints: number, drawn: Rect): { dx: number; dy: number } {
  if (!(drawn.width > 0) || !(drawn.height > 0)) return { dx: 0, dy: 0 };
  return { dx: dxPoints / drawn.width, dy: dyPoints / drawn.height };
}

/** A photo-fraction box → where to draw it on screen. */
export function toScreenRect(box: FocusBox, drawn: Rect): Rect {
  return {
    x: drawn.x + box.x * drawn.width,
    y: drawn.y + box.y * drawn.height,
    width: box.w * drawn.width,
    height: box.h * drawn.height,
  };
}

/** The box a tap on a detected item's dot snaps to: the item, plus a little margin. */
export function snapToObject(object: DetectedObject): FocusBox {
  const { x, y, w, h } = object.box;
  return clampBox({ x: x - SNAP_PAD, y: y - SNAP_PAD, w: w + SNAP_PAD * 2, h: h + SNAP_PAD * 2 });
}

/**
 * Where the box starts when the editor opens: around the item Vision is most
 * sure of, or — with no detections — the middle of the photo, which is where
 * the viewfinder told the seller to put it.
 */
export function initialBox(objects: readonly DetectedObject[] | undefined): FocusBox {
  if (objects && objects.length > 0) return snapToObject(objects[0]);
  return { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
}

/**
 * True when the box is (nearly) the whole photo. Searching that again would
 * bill a scan for the search the seller already has, so the button stays off.
 */
export function isWholePhoto(box: FocusBox, tolerance = 0.03): boolean {
  return box.x <= tolerance && box.y <= tolerance && box.w >= 1 - tolerance * 2 && box.h >= 1 - tolerance * 2;
}

/**
 * The cache key for a box. Rounded to whole percents so a box nudged by a
 * pixel or two reuses the result already paid for instead of billing again.
 */
export function boxKey(box: FocusBox): string {
  const pct = (n: number) => Math.round(n * 100);
  return `${pct(box.x)},${pct(box.y)},${pct(box.w)},${pct(box.h)}`;
}

/** A photo-fraction box → the whole-pixel crop rectangle expo-image-manipulator takes. */
export function toPixelCrop(
  box: FocusBox,
  image: Size,
): { originX: number; originY: number; width: number; height: number } {
  const b = clampBox(box, 0);
  const originX = clamp(Math.floor(b.x * image.width), 0, Math.max(0, image.width - 1));
  const originY = clamp(Math.floor(b.y * image.height), 0, Math.max(0, image.height - 1));
  const width = clamp(Math.round(b.w * image.width), 1, image.width - originX);
  const height = clamp(Math.round(b.h * image.height), 1, image.height - originY);
  return { originX, originY, width, height };
}

/**
 * True when two images have the same shape. The full-resolution capture is
 * cropped only when it matches the photo the seller drew on; a mismatch means
 * one of them was rotated differently, and cropping it would cut out the wrong
 * part — the exact bug that got the viewfinder crop reverted.
 */
export function sameAspect(a: Size, b: Size, tolerance = 0.02): boolean {
  if (!(a.width > 0) || !(a.height > 0) || !(b.width > 0) || !(b.height > 0)) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / rb <= tolerance;
}
