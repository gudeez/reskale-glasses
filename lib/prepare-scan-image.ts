// From the Reskale app: first written 2026-07-31, last changed 2026-10-20 (before this repo). See HACKATHON.md.
import {
  ImageManipulator,
  SaveFormat,
  type ImageManipulatorContext,
  type ImageRef,
} from 'expo-image-manipulator';
import { sameAspect, toPixelCrop, type FocusBox } from '@/lib/focus-crop';

/**
 * Longest edge, in pixels, for an image sent to the identify pipeline.
 *
 * Brand marks, model numbers and cover text stay legible well below full sensor
 * resolution, so this is about payload rather than accuracy: a raw capture is
 * ~4-6MB (~8MB once base64-encoded), which is slow and expensive to upload on
 * mobile data for no gain in identification quality.
 */
const MAX_EDGE = 1536;

const COMPRESS = 0.8;

/**
 * Normalize a captured photo for the identify pipeline: downscale only, never crop.
 *
 * This replaces the old viewfinder crop. Cropping to the on-screen box required
 * the preview's scale mode, its true measured bounds and the capture's EXIF
 * orientation to agree; on Android they did not, and the result was a
 * zoomed-in, off-centre crop that cut out the item being scanned. Sending the
 * whole frame cannot lose the subject, and the model reads it just as well.
 */
export async function prepareScanImage(uri: string): Promise<string> {
  const sourceContext = ImageManipulator.manipulate(uri);
  let source: ImageRef | null = null;
  let resizedContext: ImageManipulatorContext | null = null;
  let resized: ImageRef | null = null;

  try {
    source = await sourceContext.renderAsync();
    const { width, height } = source;

    // Already small enough (or unreadable dimensions) — just re-encode.
    if (!(width > 0) || !(height > 0) || Math.max(width, height) <= MAX_EDGE) {
      const saved = await source.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
      return saved.uri;
    }

    // Constrain the longer edge so portrait and landscape captures both land
    // under the cap; expo-image-manipulator derives the other edge from it.
    resizedContext = ImageManipulator.manipulate(source);
    resizedContext.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    resized = await resizedContext.renderAsync();

    const saved = await resized.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    resized?.release();
    resizedContext?.release();
    source?.release();
    sourceContext.release();
  }
}

/**
 * Crop a scan photo to the box the seller drew on it, for a search of just
 * that item (ENG-176). One manipulator pass: render, read the size, crop,
 * shrink to MAX_EDGE.
 *
 * `displayUri` is the photo the box was drawn on (the downscaled scan image);
 * `sourceUri` is the full-resolution capture, preferred because a crop of a
 * small part of the frame keeps more detail. It is used only when its shape
 * matches the photo on screen — a mismatch means one of the two was rotated
 * differently, and cropping it would cut out the wrong part of the picture.
 */
export async function prepareFocusCrop(
  displayUri: string,
  sourceUri: string | null,
  box: FocusBox,
): Promise<string> {
  const contexts: ImageManipulatorContext[] = [];
  const refs: ImageRef[] = [];
  const render = async (from: string | ImageRef, edit?: (ctx: ImageManipulatorContext) => void) => {
    const ctx = ImageManipulator.manipulate(from);
    contexts.push(ctx);
    edit?.(ctx);
    const ref = await ctx.renderAsync();
    refs.push(ref);
    return ref;
  };

  try {
    const display = await render(displayUri);
    let base: ImageRef = display;
    if (sourceUri && sourceUri !== displayUri) {
      const full = await render(sourceUri).catch(() => null);
      if (full && sameAspect(full, display)) base = full;
    }

    const crop = toPixelCrop(box, base);
    const longest = Math.max(crop.width, crop.height);
    const cropped = await render(base, (ctx) => {
      ctx.crop(crop);
      if (longest > MAX_EDGE) {
        ctx.resize(crop.width >= crop.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
      }
    });

    const saved = await cropped.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    refs.forEach((r) => r.release());
    contexts.forEach((c) => c.release());
  }
}
