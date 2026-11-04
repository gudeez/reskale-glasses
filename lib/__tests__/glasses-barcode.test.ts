import { describe, it, expect } from 'vitest';
import { pickProductBarcode, PRODUCT_BARCODE_TYPES } from '@/lib/glasses/barcode';

// What expo-camera's scanFromURLAsync hands back differs by platform: iOS names
// the format ("ean13", or Vision's "org.gs1.EAN-13"), Android sends ML Kit's
// numeric format code (EAN_13 = 32, EAN_8 = 64, QR = 256, UPC_A = 512,
// UPC_E = 1024). The picker has to read both.

describe('pickProductBarcode', () => {
  it('asks the scanner only for retail product formats', () => {
    expect([...PRODUCT_BARCODE_TYPES].sort()).toEqual(['ean13', 'ean8', 'upc_a', 'upc_e']);
  });

  it('accepts an EAN-13', () => {
    expect(pickProductBarcode([{ type: 'ean13', data: '5901234123457' }])).toBe('5901234123457');
  });

  it('accepts a UPC-A', () => {
    expect(pickProductBarcode([{ type: 'upc_a', data: '012345678905' }])).toBe('012345678905');
  });

  it('accepts a UPC-E', () => {
    expect(pickProductBarcode([{ type: 'upc_e', data: '01234565' }])).toBe('01234565');
  });

  it('accepts an EAN-8', () => {
    expect(pickProductBarcode([{ type: 'ean8', data: '96385074' }])).toBe('96385074');
  });

  it("reads Android's numeric format codes", () => {
    expect(pickProductBarcode([{ type: 32, data: '5901234123457' }])).toBe('5901234123457');
    expect(pickProductBarcode([{ type: 512, data: '012345678905' }])).toBe('012345678905');
    expect(pickProductBarcode([{ type: 1024, data: '01234565' }])).toBe('01234565');
    expect(pickProductBarcode([{ type: 64, data: '96385074' }])).toBe('96385074');
  });

  it("reads iOS Vision's format names", () => {
    expect(pickProductBarcode([{ type: 'org.gs1.EAN-13', data: '5901234123457' }])).toBe('5901234123457');
    expect(pickProductBarcode([{ type: 'org.gs1.UPC-E', data: '01234565' }])).toBe('01234565');
  });

  it('trims whitespace around the digits', () => {
    expect(pickProductBarcode([{ type: 'ean13', data: ' 5901234123457\n' }])).toBe('5901234123457');
  });

  it('rejects a QR code, even one that holds only digits', () => {
    expect(pickProductBarcode([{ type: 'qr', data: '012345678905' }])).toBeNull();
    expect(pickProductBarcode([{ type: 256, data: '012345678905' }])).toBeNull();
    expect(pickProductBarcode([{ type: 'org.iso.QRCode', data: '012345678905' }])).toBeNull();
  });

  it('rejects other non-product formats', () => {
    expect(pickProductBarcode([{ type: 'code128', data: '012345678905' }])).toBeNull();
    expect(pickProductBarcode([{ type: 1, data: '012345678905' }])).toBeNull();
  });

  it('rejects anything that is not all digits', () => {
    expect(pickProductBarcode([{ type: 'ean13', data: '59012341234A7' }])).toBeNull();
    expect(pickProductBarcode([{ type: 'ean13', data: 'https://x.co/1' }])).toBeNull();
    expect(pickProductBarcode([{ type: 'ean13', data: '' }])).toBeNull();
  });

  it('rejects the wrong length', () => {
    expect(pickProductBarcode([{ type: 'ean13', data: '590123412345' + '78' }])).toBeNull(); // 14
    expect(pickProductBarcode([{ type: 'ean13', data: '1234567' }])).toBeNull(); // 7
    expect(pickProductBarcode([{ type: 'upc_a', data: '12345678901' }])).toBeNull(); // 11
  });

  it('prefers the first valid code', () => {
    expect(
      pickProductBarcode([
        { type: 'qr', data: 'https://example.com' },
        { type: 'ean13', data: '5901234123457' },
        { type: 'upc_a', data: '012345678905' },
      ]),
    ).toBe('5901234123457');
  });

  it('accepts a code whose format was not reported, judging by its digits', () => {
    expect(pickProductBarcode([{ type: '', data: '012345678905' }])).toBe('012345678905');
  });

  it('returns null for no results', () => {
    expect(pickProductBarcode([])).toBeNull();
    expect(pickProductBarcode(null)).toBeNull();
    expect(pickProductBarcode(undefined)).toBeNull();
  });

  it('ignores malformed entries instead of throwing', () => {
    const junk = [null, { type: 'ean13' }, { type: 'ean13', data: 42 }] as unknown as Parameters<typeof pickProductBarcode>[0];
    expect(pickProductBarcode(junk)).toBeNull();
  });
});
