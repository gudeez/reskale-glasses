// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
import { describe, it, expect } from 'vitest';
import { redirectMetaCallback } from '@/lib/glasses/meta-link';

describe('redirectMetaCallback', () => {
  it('sends the Meta AI pairing callback back to the glasses screen', () => {
    expect(redirectMetaCallback('reskale-meta://?authorityKey=abc&metaWearablesAction=register&x=1')).toBe('/glasses');
    // The app's own scheme too, in case Meta AI is ever pointed at it.
    expect(redirectMetaCallback('reskale://?metaWearablesAction=unregister')).toBe('/glasses');
  });

  it('leaves every other link alone', () => {
    for (const path of [
      'reskale://reset-password?code=123',
      'reskale://google-auth#access_token=abc',
      '/subscription-success?session_id=cs_1',
      'reskale://glasses',
      'reskale-meta://glasses',
      'reskale://?notmetaWearablesAction=register',
    ]) {
      expect(redirectMetaCallback(path)).toBe(path);
    }
  });
});
