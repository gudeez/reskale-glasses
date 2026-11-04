// Pre-existing (Reskale), trimmed for this repo: Android only.
import { scanFromURLAsync } from 'expo-camera';
import { PRODUCT_BARCODE_TYPES, type ScannedCode } from './barcode';

/**
 * Every product barcode in a saved photo. expo-camera's scanFromURLAsync (ML
 * Kit) honours the formats asked for on Android. With none found, the scan
 * falls back to identifying the photo.
 */
export async function readBarcodesFromPhoto(uri: string): Promise<ScannedCode[]> {
  return scanFromURLAsync(uri, [...PRODUCT_BARCODE_TYPES]);
}
