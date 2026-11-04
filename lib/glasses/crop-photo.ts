// From the Reskale app: first written 2026-11-02, last changed 2026-11-02 (before this repo). See HACKATHON.md.
import { ImageManipulator } from 'expo-image-manipulator';
import type { FocusBox } from '@/lib/focus-crop';
import { prepareFocusCrop } from '@/lib/prepare-scan-image';
import { canCropTo } from './crop-box';

/**
 * A glasses photo cut down to the aiming box, or the photo unchanged when the
 * box can't be trusted to line up (see canCropTo) or the crop fails — the
 * scan must never lose the item to a bad crop.
 */
export async function cropToBox(uri: string, box: FocusBox, frameAspect: number | null | undefined): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  try {
    const photo = await ctx.renderAsync();
    const size = { width: photo.width, height: photo.height };
    photo.release();
    if (!canCropTo(size, frameAspect)) return uri;
    return await prepareFocusCrop(uri, null, box);
  } catch (err) {
    if (__DEV__) console.warn('[glasses] crop failed, sending the whole photo:', err);
    return uri;
  } finally {
    ctx.release();
  }
}
