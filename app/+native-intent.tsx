// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
import { redirectMetaCallback } from '@/lib/glasses/meta-link';

/**
 * expo-router's hook for links that open the app. Only the Meta AI pairing
 * callback is rewritten (see lib/glasses/meta-link.ts).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectMetaCallback(path);
}
