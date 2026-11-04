/**
 * The aiming box on the glasses live view. Geometry is lib/focus-crop.ts's:
 * a FocusBox in 0–1 fractions of the frame. Pure.
 *
 * The live view and the photo are the same camera, so one box fits both — but
 * only when they have the same shape. If they don't (a rotated photo, a
 * different crop on the glasses), the box would land on the wrong part of the
 * picture, so the whole photo is sent instead: losing the zoom is better than
 * cutting the item out (the lesson of the reverted phone viewfinder crop,
 * a3d20e88).
 */

import { clampBox, MIN_SIDE, sameAspect, type FocusBox, type Size } from '@/lib/focus-crop';

/** Centred over the middle: the glasses see far wider than the wearer is looking. */
export const DEFAULT_BOX: FocusBox = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

/** Bigger than the editor's minimum: a glasses photo is smaller than a phone's. */
export const MIN_GLASSES_SIDE = Math.max(MIN_SIDE, 0.2);

/** A box read back from storage, or the default when it is missing or garbled. */
export function parseBox(raw: string | null): FocusBox {
  if (!raw) return DEFAULT_BOX;
  try {
    const b = JSON.parse(raw) as Partial<FocusBox>;
    const sides = [b.x, b.y, b.w, b.h];
    if (!sides.every((n) => typeof n === 'number' && Number.isFinite(n))) return DEFAULT_BOX;
    return clampBox(b as FocusBox, MIN_GLASSES_SIDE);
  } catch {
    return DEFAULT_BOX;
  }
}

/** Crop to the box only when the photo has the live view's shape. */
export function canCropTo(photo: Size, frameAspect: number | null | undefined): boolean {
  if (!frameAspect || !(frameAspect > 0)) return false;
  return sameAspect(photo, { width: frameAspect, height: 1 });
}

/**
 * Meta's glasses hand back photos as landscape pixels with no rotation tag,
 * though the wearer sees (and the live view shows) the scene upright in
 * portrait: text reads bottom to top. Measured 2026-11-03 on a 1440×1080
 * capture. A quarter turn clockwise puts it right (lib/glasses/upright-photo.ts).
 */
export function needsQuarterTurn(size: { width: number; height: number }): boolean {
  return size.width > size.height;
}
