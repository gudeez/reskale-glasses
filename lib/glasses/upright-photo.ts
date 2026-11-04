import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { needsQuarterTurn } from './crop-box';

/**
 * The photo turned upright, as a new file; the photo unchanged when it is
 * already upright or the turn fails — a sideways photo still scans.
 */
export async function uprightPhoto(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  try {
    const photo = await ctx.renderAsync();
    const size = { width: photo.width, height: photo.height };
    photo.release();
    if (!needsQuarterTurn(size)) return uri;
    const turning = ImageManipulator.manipulate(uri).rotate(90);
    try {
      const turned = await turning.renderAsync();
      try {
        // Near-lossless: this is the photo every later step crops and downscales.
        return (await turned.saveAsync({ compress: 0.92, format: SaveFormat.JPEG })).uri;
      } finally {
        turned.release();
      }
    } finally {
      turning.release();
    }
  } catch (err) {
    if (__DEV__) console.warn('[glasses] could not turn the photo upright:', err);
    return uri;
  } finally {
    ctx.release();
  }
}
