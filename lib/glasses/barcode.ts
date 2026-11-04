/**
 * Picking a retail product barcode out of what the barcode reader saw in a
 * glasses photo. Pure — no native imports — so it unit-tests in plain Node.
 *
 * The readers (lib/glasses/read-barcodes.ts) report the format differently per
 * platform: iOS names it ("ean13", "upc_e", or Vision's "org.gs1.EAN-13"),
 * Android sends ML Kit's numeric format code. Both are read here.
 */

/** The formats asked of the reader: the ones printed on retail packaging. */
export const PRODUCT_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** The parts of an expo-camera BarcodeScanningResult this needs. */
export interface ScannedCode {
  type: string | number;
  data: string;
}

/** ML Kit Barcode.FORMAT_* codes: EAN_13, EAN_8, UPC_A, UPC_E. */
const ML_KIT_PRODUCT_FORMATS = new Set([32, 64, 512, 1024]);

/** Format names, lower-cased with punctuation removed ("org.gs1.UPC-E" → "orggs1upce"). */
const PRODUCT_FORMAT_NAMES = ['ean13', 'ean8', 'upca', 'upce'];

/** EAN-8 / UPC-E are 8 digits, UPC-A 12, EAN-13 13. */
const PRODUCT_CODE = /^(\d{8}|\d{12}|\d{13})$/;

function isProductFormat(type: unknown): boolean {
  if (typeof type === 'number') return ML_KIT_PRODUCT_FORMATS.has(type);
  if (typeof type !== 'string') return false;
  const name = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Not reported at all: judge by the digits alone.
  if (name === '') return true;
  return PRODUCT_FORMAT_NAMES.some((format) => name.endsWith(format));
}

/**
 * The first product barcode in `results`, as digits — or null when there is
 * none. A QR code or any other format is ignored even when it holds only
 * digits: it does not identify a product.
 */
export function pickProductBarcode(results: readonly ScannedCode[] | null | undefined): string | null {
  if (!Array.isArray(results)) return null;
  for (const result of results) {
    if (!result || typeof result.data !== 'string') continue;
    if (!isProductFormat(result.type)) continue;
    const code = result.data.trim();
    if (PRODUCT_CODE.test(code)) return code;
  }
  return null;
}
